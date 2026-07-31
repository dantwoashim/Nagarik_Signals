import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readJsonLimited,
  readRequestBodyLimited,
  readSingleMultipartFile,
  RequestBodyError,
} from './requestBody';

test('body limiting rejects chunked input before retaining an oversized body', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
      controller.close();
    },
  });
  const request = new Request('https://example.test/api', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  await assert.rejects(readRequestBodyLimited(request, 10), (error: unknown) => {
    return error instanceof RequestBodyError && error.code === 'request_too_large';
  });
});

test('bounded JSON and multipart readers preserve one accepted file', async () => {
  const json = await readJsonLimited<{ ok: boolean }>(
    new Request('https://example.test/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    }),
    64,
  );
  assert.deepEqual(json, { ok: true });

  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'evidence.jpg', { type: 'image/jpeg' }));
  const file = await readSingleMultipartFile(
    new Request('https://example.test/api', { method: 'POST', body: form }),
    { maximumBytes: 1_024, fieldName: 'file' },
  );
  assert.equal(file.name, 'evidence.jpg');
  assert.equal(file.size, 3);
});
