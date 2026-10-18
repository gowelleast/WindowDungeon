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
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';

    const eventName = github.context.eventName;
    console.log(`[Reverse-Verification] Triggered by event: ${eventName} using Gemini (${modelName})`);

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

  // 1-1. Commit Status를 'Pending'으로 설정하여 머지 차단
  await setCommitStatus(octokit, owner, repo, headSha, {
    state: 'pending',
    description: '⏳ 시니어의 역검증 질문 답변을 대기 중입니다.',
  });

  // 1-2. PR Diff 가져오기
  const diff = await fetchPrDiff(octokit, owner, repo, pull_number);
  if (!diff || diff.trim().length === 0) {
    console.log('[Reverse-Verification] Empty diff. Approving automatically.');
    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: '✅ 변경된 코드 내용이 없습니다.',
    });
    return;
  }

  // 1-3. Gemini에게 시니어 면접관 페르소나로 질문 생성 요청
  const prompt = `
당신은 실리콘밸리의 깐깐하지만 유쾌한 시니어 소프트웨어 엔지니어이자 테크 면접관입니다.
요즘 주니어 개발자들이 AI로 코드를 무지성 생성하여 복사/붙여넣기한 뒤 아무 생각 없이 PR을 올리는 풍조를 바로잡고자 합니다.

아래 PR 정보와 git diff를 분석하고, 작성자(@${author})가 **"자신이 짠 코드의 내부 동작 원리, 설계 의도, 제약사항, 또는 엣지 케이스"**를 진짜 이해하고 있는지 검증할 날카로운 질문 1~2개를 작성하세요.

[요구사항]
1. 단순 문법 질문이나 오타 지적이 아닌, 아키텍처/자료구조/동시성/에러 핸들링/트레이드오프 관련 질문을 던지세요.
2. 질문은 명확한 단답형 또는 1~3문장으로 답할 수 있는 서술형 퀴즈 형식이어야 합니다.
3. 톤앤매너: 정중하지만 날카롭고 약간의 위트(커피 마시는 시니어 느낌)를 담아주세요.
4. 마크다운 형식으로 작성하세요.

[PR 제목]
${pr.title}

[PR 본문]
${pr.body || '(내용 없음)'}

[Git Diff (일부)]
\`\`\`diff
${diff.slice(0, 15000)}
\`\`\`
`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: '당신은 개발자의 코드 이해도를 날카롭게 검증하는 시니어 개발자입니다.',
  });

  const response = await model.generateContent(prompt);
  const questionContent = response.response.text();

  // 1-4. PR에 봇 질문 댓글 등록
  const commentBody = `${BOT_TAG}
### ☕ [시니어의 역검증 타임] 커피 한 잔 마시면서 코드 봤는데요...

안녕하세요 @${author}님! 요즘 AI가 코드를 참 잘 짜주죠? 😉  
하지만 머지(Merge)되기 전에, 작성자 본인이 이 코드의 흐름을 정확히 꿰뚫고 있는지 확인이 필요합니다.

아래 질문에 대해 **이 PR의 댓글로 답변**을 남겨주세요. 타당한 답변이 확인되면 즉시 **APPROVE** 리뷰가 등록됩니다!

---

${questionContent}

---
*💡 TIP: 당황하지 마시고 코드를 작성할 때 고려했던 설계 의도와 동작 배경을 솔직하게 설명해 주시면 됩니다.*
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
당신은 PR 작성자의 답변을 엄격하게 심사하는 시니어 테크 리드입니다.
아래에 코드 Diff, 시니어가 출제한 검증 질문, 그리고 PR 작성자(@${prAuthor})의 답변이 주어집니다.

작성자의 답변이 질문의 핵심 의도를 짚고 있으며, 본인이 코드를 직접 이해하고 짠 것인지 평가하세요.

[코드 Diff (요약)]
\`\`\`diff
${diff.slice(0, 10000)}
\`\`\`

[출제된 질문]
${botComment.body}

[작성자의 답변]
"${comment.body}"

[채점 기준]
- 10점 만점 기준:
  - 1~4점: 엉뚱한 답변, 피상적인 답변, AI 환각 답변, 동문서답
  - 5~6점: 절반만 맞거나 핵심 원리를 모호하게 얼버무림
  - 7~10점: 코드 동작 원리, 제약사항, 설계 의도를 정확히 이해하고 명쾌하게 설명함
- 7점 이상일 때만 passed: true

반드시 아래 JSON 스키마 형식으로만 응답하세요:
{
  "score": number,
  "passed": boolean,
  "feedback": "작성자에게 전달할 총평 코멘트 (존댓말, 격려/피드백 포함)",
  "reason": "채점 사유 요약"
}
`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
    systemInstruction: '당신은 코드 이해도 답변을 채점하는 시니어 엔지니어입니다. 반드시 지정된 JSON 형식으로만 응답하세요.',
  });

  const response = await model.generateContent(evaluationPrompt);
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
    const successComment = `### 🎉 [역검증 통과] 합격입니다! (점수: ${evalResult.score}/10) ✅

@${prAuthor}님, 훌륭합니다! 자신이 작성한 코드의 맥락과 원리를 완벽하게 파악하고 계시네요. 👏

> **시니어의 한마디**: ${evalResult.feedback}

머지 조건을 충족하였으므로 시니어 봇의 **APPROVE** 리뷰를 등록합니다. 수고하셨습니다! 🚀`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: successComment,
    });

    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'success',
      description: `✅ 코드 이해도 검증 통과 (점수: ${evalResult.score}/10)`,
    });

    // PR 리뷰 APPROVE
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number,
        event: 'APPROVE',
        body: `LGTM! ☕ (Reverse-Verification Bot: 작성자의 코드 이해도 검증 통과 - ${evalResult.score}/10점)`,
      });
      console.log(`[Reverse-Verification] APPROVE review submitted on PR #${pull_number}`);
    } catch (reviewError) {
      console.warn(`[Reverse-Verification] Review creation note: ${reviewError.message}`);
    }
  } else {
    // FAIL: 피드백 댓글 등록 및 Commit Status Failure 유지
    const failComment = `### ❌ [역검증 미흡] 재검토가 필요합니다 (점수: ${evalResult.score}/10)

@${prAuthor}님, 아쉽지만 답변 내용으로는 코드의 세부 동작 원리를 충분히 이해했다고 판단하기 어렵습니다. 😅

> **피드백**: ${evalResult.feedback}
> **보완 필요점**: ${evalResult.reason}

코드가 실제로 어떻게 동작하는지 다시 한번 살펴보시고, **이 댓글 아래에 추가 답변**을 남겨주시면 다시 채점해 드립니다! 화이팅! 💪`;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: failComment,
    });

    await setCommitStatus(octokit, owner, repo, headSha, {
      state: 'failure',
      description: `❌ 코드 이해도 부족 (점수: ${evalResult.score}/10). 재답변 필요`,
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
