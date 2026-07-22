type JsonObject = Record<string, unknown>;

const baseUrl = process.env.NAGARIK_PHASE2_BASE_URL ?? 'http://127.0.0.1:3001';
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

async function expectStatus(label: string, response: Response, status: number) {
  const payload = await readJson(response);
  if (response.status !== status) {
    throw new Error(`${label} expected HTTP ${status}, got ${response.status}: ${JSON.stringify(payload)}`);
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

async function main() {
  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  );
  const form = new FormData();
  form.append('file', new Blob([png1x1], { type: 'image/png' }), `phase2-${runId}.png`);

  const upload = await expectOk('upload', await fetch(`${baseUrl}/api/upload`, { method: 'POST', body: form }));
  const report = await expectOk('report create', await postJson('/api/reports', {
    sessionId: `phase2-reporter-${runId}`,
    title: `Phase 2 API smoke issue ${runId}`,
    description: 'Safe public infrastructure report created by the Phase 2 API smoke test.',
    category: 'water',
    wardId: 'kathmandu-10',
    locality: 'Kathmandu Ward 10',
    latDisplay: 27.692,
    lngDisplay: 85.336,
    geohash: '27.69:85.34',
    firstObservedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    photoUrl: upload.photoUrl,
    evidenceHash: upload.evidenceHash,
  }));

  const issueId = Number(report.issueId);
  if (!Number.isInteger(issueId)) throw new Error(`report issueId was not numeric: ${JSON.stringify(report)}`);

  const detail = await expectOk('issue detail', await fetch(`${baseUrl}/api/reports/${issueId}`));
  const verify = await expectOk('verify', await postJson(`/api/reports/${issueId}/verify`, {
    sessionId: `phase2-verifier-${runId}`,
  }));
  const duplicate = await expectStatus('duplicate verify', await postJson(`/api/reports/${issueId}/verify`, {
    sessionId: `phase2-verifier-${runId}`,
  }), 409);
  const status = await expectOk('status update', await postJson(`/api/reports/${issueId}/status`, {
    newStatus: 'in_progress',
    note: 'Phase 2 smoke test steward update.',
  }, process.env.NAGARIK_STEWARD_SECRET ? { 'x-nagarik-steward-secret': process.env.NAGARIK_STEWARD_SECRET } : {}));
  const proof = await expectOk('verify proof', await fetch(`${baseUrl}/api/verify-proof/${issueId}`));
  const dashboard = await expectOk('dashboard', await fetch(`${baseUrl}/api/dashboard`));
  const health = await expectOk('health', await fetch(`${baseUrl}/api/health`));
  const reindex = await expectOk('reindex', await fetch(`${baseUrl}/api/reindex`, {
    method: 'POST',
    headers: process.env.NAGARIK_REINDEX_SECRET ? { 'x-nagarik-reindex-secret': process.env.NAGARIK_REINDEX_SECRET } : {},
  }));

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    issueId,
    upload: {
      photoUrl: upload.photoUrl,
      evidenceHash: upload.evidenceHash,
      exifStripped: upload.exifStripped,
      compressed: upload.compressed,
    },
    report: {
      issuePda: report.issuePda,
      txSig: report.txSig,
      metadataHash: report.metadataHash,
    },
    detailMode: detail.mode,
    verify: {
      verificationPda: verify.verificationPda,
      txSig: verify.txSig,
      verificationCount: verify.verificationCount,
    },
    duplicateReason: duplicate.reason,
    status: {
      statusUpdatePda: status.statusUpdatePda,
      txSig: status.txSig,
      newStatus: status.newStatus,
    },
    proof: {
      matches: proof.matches,
      explorerUrl: proof.explorerUrl,
    },
    dashboard: {
      totalIssues: (dashboard.stats as JsonObject | undefined)?.totalIssues,
      unresolvedIssues: (dashboard.stats as JsonObject | undefined)?.unresolvedIssues,
    },
    health: {
      ok: health.ok,
      programId: health.programId,
    },
    reindex: {
      chainIssueCount: reindex.chainIssueCount,
      missingReadRows: Array.isArray(reindex.missingReadRows) ? reindex.missingReadRows.length : null,
      mismatches: Array.isArray(reindex.mismatches) ? reindex.mismatches.length : null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
