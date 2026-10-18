import * as core from '@actions/core';
import * as github from '@actions/github';
import { GoogleGenerativeAI } from '@google/generative-ai';

const STATUS_CONTEXT = 'reverse-verification/understanding';
const BOT_TAG = '<!-- reverse-verification-bot -->';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!token) throw new Error('GITHUB_TOKEN is required');
    if (!apiKey) throw new Error('GEMINI_API_KEY is required');

    const octokit = github.getOctokit(token);
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

    const eventName = github.context.eventName;
    console.log(`[Reverse-Verification] Triggered by event: ${eventName} (Preferred model: ${modelName})`);

    if (eventName === 'pull_request') {
      await handlePullRequest(octokit, genAI, modelName);
    } else if (eventName === 'issue_comment') {
      await handleIssueComment(octokit, genAI, modelName);
    } else {
      console.log(`[Reverse-Verification] Unsupported event: ${eventName}. Skipping.`);
    }
  } catch (error) {
    core.setFailed(`[Reverse-Verification] Error: ${error.message}`);
  }
}

/**
 * 활성화된 모델을 순차적으로 탐색하여 실패 없이 응답을 생성하는 헬퍼 함수
 */
async function generateWithFallback(genAI, preferredModel, prompt, options = {}) {
  const candidates = Array.from(new Set([
    preferredModel,
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
  ].filter(Boolean)));

  let lastError = null;
  for (const name of candidates) {
    try {
      console.log(`[Reverse-Verification] Trying model: ${name}...`);
      const model = genAI.getGenerativeModel({
        model: name,
        ...options,
      });
      const response = await model.generateContent(prompt);
      console.log(`[Reverse-Verification] Successfully generated content using ${name}!`);
      return response;
    } catch (err) {
      console.warn(`[Reverse-Verification] Model ${name} failed: ${err.message}`);
      lastError = err;
      if (!err.message.includes('404') && !err.message.includes('not found')) {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * 마크다운 코드 블록 및 4칸 들여쓰기를 제거하여 일반 텍스트 문단으로 정돈하는 헬퍼 함수
 */
function cleanMarkdownOutput(text) {
  let cleaned = text.trim();
  // 마크다운 코드 블록(```markdown ... ```)으로 전체가 감싸져 있으면 제거
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\s*/i, '').replace(/```\s*$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
  }
  // GitHub 마크다운에서 4칸 이상의 들여쓰기는 <pre><code> 코드 블록으로 렌더링되므로, 행 시작의 4칸 이상 공백 제거
  cleaned = cleaned.split('\n').map(line => line.replace(/^ {4,}/, '')).join('\n');
  // 중복 헤더 또는 서론 제거
  cleaned = cleaned.replace(/^#+.*코드 검증 질의서.*\n+/gi, '');
  cleaned = cleaned.replace(/^본 PR의 안정적인 배포.*\n+/gi, '');
  cleaned = cleaned.replace(/^머지 승인\(Approval\)을 위해.*\n+/gi, '');
  cleaned = cleaned.replace(/^---\s*\n+/g, '');
  return cleaned.trim();
}

/**
 * 1. PR 생성 또는 새 커밋 푸시 시: 질문 생성 및 Pending 상태 부여
 */
async function handlePullRequest(octokit, genAI, modelName) {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    console.log('[Reverse-Verification] No pull_request payload found.');
    return;
  }

  const { owner, repo } = github.context.repo;
  const pull_number = pr.number;
  const author = pr.user.login;
  const headSha = pr.head.sha;

  console.log(`[Reverse-Verification] Analyzing PR #${pull_number} by @${author}`);

  // 1-1. PR Diff 가져오기
  const diff = await fetchPrDiff(octokit, owner, repo, pull_number);
  if (!diff || diff.trim().length === 0) {
    console.log('[Reverse-Verification] Empty diff. Approving automatically.');
    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: '변경된 코드 내용이 없어 검증을 통과했습니다.',
    });
    return;
  }

  // 1-2. Gemini에게 사소한 변경(Trivial) 판별 및 질문 생성 요청 (JSON 구조화 출력)
  const triagePrompt = `
당신은 PR의 변경 영향도를 엄밀히 평가하는 시니어 엔지니어입니다.
아래 PR 정보와 git diff를 분석하여, 이 변경이 **"개발자의 코드 이해도 검증 퀴즈가 필요한 실질적 로직 변경(isTrivial: false)"**인지, 아니면 **"불필요한 질문 없이 즉시 자동 승인(Approve)해야 하는 사소한 변경(isTrivial: true)"**인지 판별하십시오.

[사소한 변경(isTrivial: true) 판단 기준 - 질문 생략 및 자동 승인 대상]
1. 문서 및 마크다운: README.md, spec.md, docs, 주석(Comment), 오타(Typo) 수정
2. 스타일 및 포맷팅: 단순 줄바꿈, 린트 정리, 공백 수정
3. 사소한 설정/상수: 비즈니스 로직에 영향이 없는 1~3줄 내외의 단순한 값 변경
4. 정적 에셋: 이미지, 텍스트 파일 등

[검증 질의가 필요한 변경(isTrivial: false) 기준]
1. 새로운 기능 추가 (Feature)
2. 버그 수정 (Bug fix)
3. 게임 엔진, 물리 연산, 상태 관리, 통신 프로토콜, 이벤트 핸들링 등 핵심 로직 수정

[질문 출제 원칙 - isTrivial이 false일 때만 작성]
1. 대학원 면접 같은 학술 논문, 물리 엔진 수식, 거창한 아키텍처 이론 질문은 절대 금지합니다.
2. PR 작성자가 자신이 올린 diff를 30초~1분만 읽어보면 누구나 자기 말로 1~2문장으로 쉽게 답할 수 있는 실용적이고 직관적인 질문 1~2개만 출제하십시오.
3. 오직 '### 1. [질문 제목]' 형태로 본문만 작성하십시오. (서론/인사말 금지)

[PR 제목]
${pr.title}

[PR 본문]
${pr.body || '(내용 없음)'}

[Git Diff (일부)]
\`\`\`diff
${diff.slice(0, 15000)}
\`\`\`

반드시 아래 JSON 스키마 형식으로만 응답하십시오:
{
  "isTrivial": boolean,
  "trivialReason": "사소한 변경으로 판단한 구체적인 이유 (isTrivial이 true일 때만 한국어 1문장)",
  "questions": "isTrivial이 false일 때만 작성: 검증 질문 1~2개 (마크다운)"
}
`;

  const response = await generateWithFallback(genAI, modelName, triagePrompt, {
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
    systemInstruction: '당신은 실무 중심의 코드 변경 영향도를 합리적으로 판단하는 시니어 엔지니어입니다. 반드시 지정된 JSON 형식으로만 응답하십시오.',
  });

  const responseText = response.response.text();
  let triageResult;
  try {
    triageResult = JSON.parse(responseText);
  } catch (err) {
    throw new Error(`Failed to parse triage JSON: ${responseText}`);
  }

  console.log(`[Reverse-Verification] Triage result - isTrivial: ${triageResult.isTrivial}`);

  // 1-3. 사소한 변경인 경우: 즉시 자동 승인(Auto-Approve) 처리
  if (triageResult.isTrivial) {
    console.log(`[Reverse-Verification] Auto-approving trivial PR: ${triageResult.trivialReason}`);

    const autoApproveComment = `${BOT_TAG}
## ⚡ [단순 변경 자동 승인] 코드 검증 절차 생략

본 PR의 변경 사항을 분석한 결과, **${triageResult.trivialReason || '사소한 변경(문서, 주석 또는 극소형 수정)'}**으로 확인되어 별도의 작성자 검증 질의 없이 **자동 승인(APPROVE)** 처리합니다. 🚀

좋은 변경 감사합니다! 바로 머지하셔도 좋습니다.`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: autoApproveComment,
    });

    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: `단순 변경 자동 승인: ${triageResult.trivialReason || '사소한 수정'}`,
    });

    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        event: 'APPROVE',
        body: `LGTM. (Reverse-Verification: 사소한 변경으로 확인되어 자동 승인 처리 - ${triageResult.trivialReason || 'Trivial change'})`,
      });
      console.log(`[Reverse-Verification] Auto-APPROVE submitted on PR #${pull_number}`);
    } catch (reviewErr) {
      console.warn(`[Reverse-Verification] Review error: ${reviewErr.message}`);
    }
    return;
  }

  // 1-4. 실질적인 변경인 경우: Commit Status 'Pending' 설정 및 질문 등록
  await setCommitStatus(octokit, owner, repo, headSha, {
    state: 'pending',
    description: '작성자의 코드 구현 의도 및 이해도 검증 답변을 대기 중입니다.',
  });

  const questionContent = cleanMarkdownOutput(triageResult.questions || '');

  const commentBody = `${BOT_TAG}
## 📋 [코드 확인 질의서] 구현 흐름 및 변경점 확인

본 PR의 원활한 코드 리뷰 및 히스토리 공유를 위해, 작성자(@${author})의 간단한 코드 확인 질의를 등록합니다.

머지 승인을 위해 아래 질의에 대해 **본 PR의 댓글로 1~2문장 내외의 간단한 소명 답변**을 작성해 주시기 바랍니다.

---

${questionContent}

---
*안내: 본 PR의 코드 diff를 직접 읽고 파악하셨다면 누구나 쉽게 답변할 수 있는 질문입니다. 답변 확인 시 즉시 승인(Approve) 처리됩니다.*
`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body: commentBody,
  });

  console.log(`[Reverse-Verification] Question posted on PR #${pull_number}`);
}

/**
 * 2. 작성자가 댓글을 남겼을 때: 답변 평가 및 채점
 */
async function handleIssueComment(octokit, genAI, modelName) {
  const payload = github.context.payload;
  const issue = payload.issue;
  const comment = payload.comment;

  // PR에 달린 댓글인지 확인 (일반 Issue 제외)
  if (!issue.pull_request) {
    console.log('[Reverse-Verification] Comment is on an issue, not a PR. Skipping.');
    return;
  }

  // 봇 본인이 단 댓글이거나, 다른 봇의 댓글이면 무시
  if (comment.user.type === 'Bot' || comment.user.login.includes('[bot]')) {
    console.log('[Reverse-Verification] Comment is from a bot. Skipping.');
    return;
  }

  const { owner, repo } = github.context.repo;
  const pull_number = issue.number;
  const prAuthor = issue.user.login;
  const commenter = comment.user.login;

  // 작성자 본인의 답변인지 보안 검증
  if (commenter !== prAuthor) {
    console.log(`[Reverse-Verification] Commenter (@${commenter}) is not the PR author (@${prAuthor}). Skipping.`);
    return;
  }

  console.log(`[Reverse-Verification] PR author @${prAuthor} replied on PR #${pull_number}! Evaluating...`);

  // 최신 PR 정보 및 Head SHA 획득
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number,
  });
  const headSha = pr.head.sha;

  // 봇이 남겼던 질문 댓글 찾기
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pull_number,
    per_page: 50,
  });

  const botComment = comments.reverse().find(c => c.body.includes(BOT_TAG));
  if (!botComment) {
    console.log('[Reverse-Verification] No previous verification question found. Skipping.');
    return;
  }

  const diff = await fetchPrDiff(octokit, owner, repo, pull_number);

  // 2-1. Gemini에게 답변 채점 요청 (JSON 포맷 강제)
  const evaluationPrompt = `
당신은 PR 작성자의 코드 이해도 답변을 검토하는 시니어 엔지니어입니다.
목표는 "작성자가 자신이 올린 PR의 변경점과 코드 흐름을 최소한 인지하고 있는가"를 확인하는 것입니다.

[평가 기준 - 실무적이고 합리적인 판단]
1. 학술적이거나 거창한 교과서적 정답을 요구하지 마십시오.
2. 작성자가 자신이 수정한 파일/변수명, 변경 의도, 또는 동작 효과를 파악하고 자기 말로 1~2문장이라도 말이 되게 설명했다면 **충분히 통과(7~10점)**로 판정하십시오.
3. 질문과 전혀 무관한 엉뚱한 답변이거나, 본인이 짠 코드와 반대되는 사실무근의 답변일 때만 반려(1~5점) 처리하십시오.

[코드 Diff (요약)]
\`\`\`diff
${diff.slice(0, 10000)}
\`\`\`

[질의 내용]
${botComment.body}

[작성자 답변]
"${comment.body}"

반드시 아래 JSON 스키마 형식으로만 응답하십시오:
{
  "score": number,
  "passed": boolean,
  "feedback": "작성자에게 전달할 간결한 피드백 (존댓말, 1~2문장)",
  "reason": "채점 사유 요약"
}
`;

  const response = await generateWithFallback(genAI, modelName, evaluationPrompt, {
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
    systemInstruction: '당신은 코드 품질과 구현 원리를 엄격히 채점하는 테크 리드입니다. 반드시 지정된 JSON 형식으로만 응답하십시오.',
  });

  const responseText = response.response.text();

  let evalResult;
  try {
    evalResult = JSON.parse(responseText);
  } catch (err) {
    throw new Error(`Failed to parse Gemini evaluation JSON: ${responseText}`);
  }

  console.log(`[Reverse-Verification] Score: ${evalResult.score}/10, Passed: ${evalResult.passed}`);

  // 2-2. 평가 결과 처리
  if (evalResult.passed) {
    // PASS: 성공 피드백 댓글 등록, Commit Status Success 전환, APPROVE 리뷰 제출
    const successComment = `## ✅ [코드 검증 통과] 소명 확인 및 머지 승인 (평가 점수: ${evalResult.score}/10)

작성자(@${prAuthor})의 소명 답변을 검토한 결과, 코드의 설계 의도 및 내부 구현 메커니즘이 타당하게 파악되었음을 확인했습니다.

### 📌 기술 검토 피드백
> ${evalResult.feedback}

본 PR에 대한 시니어 검증 절차를 완료 처리하며, 공식 **APPROVE** 리뷰를 등록합니다.`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: successComment,
    });

    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: `코드 이해도 검증 통과 (평가 점수: ${evalResult.score}/10)`,
    });

    // PR 리뷰 APPROVE
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        event: 'APPROVE',
        body: `LGTM. (Reverse-Verification: 작성자 기술 소명 완료 - 평가 점수: ${evalResult.score}/10)`,
      });
      console.log(`[Reverse-Verification] APPROVE review submitted on PR #${pull_number}`);
    } catch (reviewError) {
      console.warn(`[Reverse-Verification] Review creation note: ${reviewError.message}`);
    }
  } else {
    // FAIL: 피드백 댓글 등록 및 Commit Status Failure 유지
    const failComment = `## ⚠️ [코드 검증 반려] 추가 소명 필요 (평가 점수: ${evalResult.score}/10)

작성자(@${prAuthor})의 답변 내용을 검토한 결과, 구현 원리 및 잠재적 리스크에 대한 기술적 소명이 미흡합니다.

### 📌 검토 의견
> **피드백**: ${evalResult.feedback}
> **보완 필요 항목**: ${evalResult.reason}

해당 변경 사항의 동작 메커니즘과 사이드 이펙트를 재확인하신 후, **본 PR에 추가 소명 댓글**을 작성해 주시기 바랍니다.`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: failComment,
    });

    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'failure',
      description: `코드 이해도 소명 미흡 (점수: ${evalResult.score}/10). 재소명 필요`,
    });
  }
}

/**
 * PR의 git diff 텍스트 가져오기
 */
async function fetchPrDiff(octokit, owner, repo, pull_number) {
  try {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: {
        format: 'diff',
      },
    });
    return String(response.data);
  } catch (err) {
    console.error('[Reverse-Verification] Failed to fetch diff:', err);
    return '';
  }
}

/**
 * 특정 커밋 SHA에 대해 GitHub Commit Status 갱신
 */
async function setCommitStatus(octokit, owner, repo, sha, { state, description }) {
  try {
    await octokit.rest.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state, // 'pending' | 'success' | 'failure' | 'error'
      context: STATUS_CONTEXT,
      description,
    });
    console.log(`[Reverse-Verification] Commit status updated: [${state}] ${description}`);
  } catch (err) {
    console.error('[Reverse-Verification] Failed to set commit status:', err);
  }
}

main();
