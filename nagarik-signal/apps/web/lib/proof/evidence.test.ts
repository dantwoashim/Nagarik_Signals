import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { verifyDeliveredEvidence } from './evidence';

const evidenceBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const evidenceHash = createHash('sha256').update(evidenceBytes).digest('hex');

async function startEvidenceServer() {
  const server = createServer((request, response) => {
    if (request.url === '/api/media/evidence.png') {
      response.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(evidenceBytes.byteLength),
      });
      response.end(evidenceBytes);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_server_address_unavailable');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test('verifyDeliveredEvidence hashes bytes returned by the media endpoint', async (t) => {
  const { server, origin } = await startEvidenceServer();
  t.after(() => server.close());

  const result = await verifyDeliveredEvidence('/api/media/evidence.png', evidenceHash, {
    appOrigin: origin,
  });
  assert.equal(result.status, 'match');
  assert.equal(result.available, true);
  assert.equal(result.computedHash, evidenceHash);
  assert.equal(result.byteLength, evidenceBytes.byteLength);
});

test('verifyDeliveredEvidence distinguishes mismatch from unavailable media', async (t) => {
  const { server, origin } = await startEvidenceServer();
  t.after(() => server.close());

  const mismatch = await verifyDeliveredEvidence('/api/media/evidence.png', '0'.repeat(64), {
    appOrigin: origin,
  });
  const missing = await verifyDeliveredEvidence('/api/media/missing.png', evidenceHash, {
    appOrigin: origin,
  });
  assert.equal(mismatch.status, 'mismatch');
  assert.equal(mismatch.available, true);
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.error, 'evidence_http_404');
});

test('verifyDeliveredEvidence refuses cross-origin URLs to avoid server-side request forgery', async () => {
  const result = await verifyDeliveredEvidence('https://example.com/evidence.png', evidenceHash, {
    appOrigin: 'https://nagarik.example',
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error, 'cross_origin_evidence_url_rejected');
});
