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

  // 1-1. Commit Status를 'Pending'으로 설정하여 머지 제한
  await setCommitStatus(octokit, owner, repo, headSha, {
    state: 'pending',
    description: '작성자의 코드 아키텍처 및 구현 의도 검증 답변을 대기 중입니다.',
  });

  // 1-2. PR Diff 가져오기
  const diff = await fetchPrDiff(octokit, owner, repo, pull_number);
  if (!diff || diff.trim().length === 0) {
    console.log('[Reverse-Verification] Empty diff. Approving automatically.');
    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: '변경된 코드 내용이 없어 검증을 통과했습니다.',
    });
    return;
  }

  // 1-3. Gemini에게 시니어 테크 리드 페르소나로 질문 생성 요청
  const prompt = `
당신은 엄격하고 전문적인 시니어 소프트웨어 아키텍트이자 테크 리드입니다.
코드 리뷰 프로세스의 품질 보증을 위해, PR 작성자(@${author})가 제출한 코드의 설계 타당성, 내부 동작 메커니즘, 기술적 제약사항 및 예외 상황에 대해 정확히 인지하고 있는지 검증하고자 합니다.

제출된 PR 메타데이터와 Git Diff를 분석하여, 작성자의 기술적 이해도를 엄밀히 평가할 수 있는 핵심 검증 질의 1~2개를 작성하십시오.

[질의 작성 원칙]
1. 단순 문법, 코드 스타일, 오타 등 피상적인 내용은 배제하고, 아키텍처 설계 의도, 자료구조/알고리즘 선택 이유, 상태 관리, 엣지 케이스 및 부작용(Side Effects) 가능성을 중점적으로 질의할 것.
2. 작성자가 논리적 근거를 바탕으로 명확히 소명할 수 있는 질문으로 구성할 것.
3. 톤앤매너: 군더더기 없고 건조하며 격식 있는 전문 엔지니어링 표준 톤 (경어체).
4. 마크다운 형식으로 작성할 것.

[서식 및 가독성 지침]
1. 전체 응답을 백틱 코드 블록(\`\`\`)으로 감싸지 마십시오.
2. 각 줄 시작 부분에 4칸 이상의 들여쓰기(공백)를 절대 넣지 마십시오. (GitHub 마크다운에서 코드 박스로 렌더링되어 가로 스크롤이 생기는 문제를 방지하기 위함)
3. 가독성을 위해 각 질문은 '### 1. [핵심 주제]' 소제목을 달고 본문과 줄바꿈을 명확히 구분하십시오.
4. 인사말, '코드 검증 질의서' 제목, 서론/결론 안내 문구는 시스템이 자동으로 붙이므로 출력하지 마시고, 오직 '### 1. [질문 제목]'부터 곧바로 출력하십시오.

[PR 제목]
${pr.title}

[PR 본문]
${pr.body || '(내용 없음)'}

[Git Diff (일부)]
\`\`\`diff
${diff.slice(0, 15000)}
\`\`\`
`;

  const response = await generateWithFallback(genAI, modelName, prompt, {
    systemInstruction: '당신은 엔지니어링 표준과 코드 품질을 엄격히 검증하는 시니어 소프트웨어 아키텍트입니다.',
  });

  const rawQuestion = response.response.text();
  const questionContent = cleanMarkdownOutput(rawQuestion);

  // 1-4. PR에 봇 질문 댓글 등록
  const commentBody = `${BOT_TAG}
## 📋 [코드 검증 질의서] 아키텍처 및 구현 의도 검증

본 PR의 안정적인 배포 및 코드 품질 보증을 위해, 작성자(@${author})의 기술 검증 질의를 등록합니다.

머지 승인(Approval)을 위해 아래 기술 질의에 대해 **본 PR의 댓글로 구체적인 설계 근거 및 답변**을 작성해 주시기 바랍니다.

---

${questionContent}

---
*안내: 본 검증은 CI/CD 자동화 정책에 의해 필수 진행되며, 작성자의 답변이 기술적으로 타당하다고 판정될 시 승인 상태로 전환됩니다.*
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
당신은 코드 리뷰 및 머지 적격성을 심사하는 엄격한 테크 리드입니다.
제출된 코드 Diff, 기존에 발송된 기술 질의, 그리고 PR 작성자(@${prAuthor})의 소명 답변을 면밀히 대조하여 작성자의 코드 이해도를 공정하고 엄격하게 평가하십시오.

[코드 Diff (요약)]
\`\`\`diff
${diff.slice(0, 10000)}
\`\`\`

[기술 질의 내용]
${botComment.body}

[작성자 소명 답변]
"${comment.body}"

[평가 기준]
- 10점 만점 척도:
  - 1~4점: 질문의 요점을 파악하지 못함, 모호하거나 사실과 다른 설명, 피상적인 답변
  - 5~6점: 기본적인 동작은 언급했으나 핵심 원리나 기술적 트레이드오프에 대한 이해 부족
  - 7~10점: 코드의 구현 메커니즘, 설계 의도, 예외 상황에 대한 명확하고 타당한 기술적 소명
- 7점 이상일 때만 passed: true 판정

반드시 아래 JSON 스키마 형식으로만 응답하십시오:
{
  "score": number,
  "passed": boolean,
  "feedback": "작성자에게 전달할 기술적 피드백 요약 (격식 있는 경어체, 건조하고 명확하게)",
  "reason": "점수 산정 근거 (내부 기록용)"
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
