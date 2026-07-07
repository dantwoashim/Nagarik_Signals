type JsonObject = Record<string, unknown>;

const baseUrl = process.env.NAGARIK_PHASE5_BASE_URL ?? process.env.NAGARIK_PHASE2_BASE_URL ?? 'http://127.0.0.1:3001';
const runId = process.env.NAGARIK_SMOKE_RUN_ID ?? Date.now().toString(36);

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as JsonObject : {};
  } catch {
    return { raw: text };
  }
}

async function expectOk(label: string, response: Response) {
  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postJson(path: string, body: JsonObject, headers: HeadersInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function uploadPng(label: string) {
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  );
  const form = new FormData();
  form.append('file', new Blob([png1x1], { type: 'image/png' }), `${label}-${runId}.png`);
  return expectOk(`${label} upload`, await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: form }));
}

function stewardHeaders() {
  return process.env.NAGARIK_STEWARD_SECRET
    ? { 'x-nagarik-steward-secret': process.env.NAGARIK_STEWARD_SECRET }
    : {};
}

function issueFrom(payload: JsonObject) {
  const issue = payload.issue as JsonObject | undefined;
  if (!issue) throw new Error(`missing issue payload: ${JSON.stringify(payload)}`);
  return issue;
}

function assertTimeline(issue: JsonObject, statuses: string[]) {
  const timeline = issue.timeline as Array<JsonObject> | undefined;
  if (!Array.isArray(timeline)) throw new Error('issue timeline missing');
  const seen = timeline.map((entry) => String(entry.status));
  for (const status of statuses) {
    if (!seen.includes(status)) throw new Error(`timeline missing ${status}: ${JSON.stringify(seen)}`);
  }
  const missingTx = timeline
    .filter((entry) => String(entry.status) === 'in_progress' || String(entry.status) === 'resolved')
    .some((entry) => !entry.txSig);
  if (missingTx) throw new Error(`status timeline is missing transaction links: ${JSON.stringify(timeline)}`);
}

async function main() {
  const reportUpload = await uploadPng('phase5-before');
  const report = await expectOk('report create', await postJson('/api/reports', {
    sessionId: `phase5-reporter-${runId}`,
    title: `Phase 5 lifecycle drain proof ${runId}`,
    description: 'Safe public infrastructure report created by the Phase 5 steward lifecycle smoke test.',
    category: 'water',
    wardId: 'kathmandu-10',
    locality: 'Kathmandu Ward 10',
    latDisplay: 27.692,
    lngDisplay: 85.336,
    geohash: '27.69:85.34',
    firstObservedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    photoUrl: reportUpload.photoUrl,
    evidenceHash: reportUpload.evidenceHash,
  }));

  const issueId = Number(report.issueId);
  if (!Number.isInteger(issueId)) throw new Error(`report issueId was not numeric: ${JSON.stringify(report)}`);

  const verifyOne = await expectOk('verify first citizen', await postJson(`/api/reports/${issueId}/verify`, {
    sessionId: `phase5-verifier-a-${runId}`,
  }));
  const verifyTwo = await expectOk('verify second citizen', await postJson(`/api/reports/${issueId}/verify`, {
    sessionId: `phase5-verifier-b-${runId}`,
  }));
  if (verifyTwo.issueStatus !== 'verified') {
    throw new Error(`second verification did not move issue to verified: ${JSON.stringify(verifyTwo)}`);
  }

  const inProgress = await expectOk('steward in progress', await postJson(`/api/reports/${issueId}/status`, {
    newStatus: 'in_progress',
    note: 'Phase 5 smoke: steward confirmed repair follow-up is in progress.',
  }, stewardHeaders()));

  const resolutionUpload = await uploadPng('phase5-after');
  const resolved = await expectOk('steward resolved', await postJson(`/api/reports/${issueId}/status`, {
    newStatus: 'resolved',
    note: 'Phase 5 smoke: steward attached after-photo resolution proof for the public asset.',
    resolutionPhotoUrl: resolutionUpload.photoUrl,
    resolutionEvidenceHash: resolutionUpload.evidenceHash,
  }, stewardHeaders()));

  const detail = await expectOk('resolved issue detail', await fetch(`${baseUrl}/api/reports/${issueId}`));
  const issue = issueFrom(detail);
  if (issue.status !== 'resolved') throw new Error(`issue did not resolve: ${JSON.stringify(issue)}`);
  if (!issue.resolutionPhotoUrl || !issue.resolutionHash) throw new Error(`resolution proof was not stored: ${JSON.stringify(issue)}`);
  assertTimeline(issue, ['submitted', 'verified', 'in_progress', 'resolved']);

  const proof = await expectOk('verify proof', await fetch(`${baseUrl}/api/verify-proof/${issueId}`));
  const dashboard = await expectOk('dashboard', await fetch(`${baseUrl}/api/dashboard`));
  const health = await expectOk('health', await fetch(`${baseUrl}/api/health`));

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    issueId,
    report: {
      issuePda: report.issuePda,
      txSig: report.txSig,
      metadataHash: report.metadataHash,
    },
    verifications: [
      { verificationPda: verifyOne.verificationPda, txSig: verifyOne.txSig, count: verifyOne.verificationCount },
      { verificationPda: verifyTwo.verificationPda, txSig: verifyTwo.txSig, count: verifyTwo.verificationCount },
    ],
    statusUpdates: [
      { status: inProgress.newStatus, statusUpdatePda: inProgress.statusUpdatePda, txSig: inProgress.txSig },
      { status: resolved.newStatus, statusUpdatePda: resolved.statusUpdatePda, txSig: resolved.txSig, proofHash: resolved.proofHash },
    ],
    resolution: {
      photoUrl: issue.resolutionPhotoUrl,
      hash: issue.resolutionHash,
    },
    proof: {
      matches: proof.matches,
      explorerUrl: proof.explorerUrl,
    },
    dashboard: {
      totalIssues: (dashboard.stats as JsonObject | undefined)?.totalIssues,
      resolvedIssues: (dashboard.stats as JsonObject | undefined)?.resolvedIssues,
      unresolvedIssues: (dashboard.stats as JsonObject | undefined)?.unresolvedIssues,
    },
    health: {
      ok: health.ok,
      programId: health.programId,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
