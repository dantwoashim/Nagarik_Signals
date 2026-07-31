export class RequestBodyError extends Error {
  constructor(
    public readonly code:
      'request_body_missing' | 'request_too_large' | 'invalid_json' | 'invalid_multipart',
    public readonly status: number,
  ) {
    super(code);
    this.name = 'RequestBodyError';
  }
}

export async function readRequestBodyLimited(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('maximum_body_bytes_invalid');
  }

  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new RequestBodyError('request_too_large', 413);
    }
    if (parsed > maximumBytes) throw new RequestBodyError('request_too_large', 413);
  }
  if (!request.body) throw new RequestBodyError('request_body_missing', 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('request_too_large');
        throw new RequestBodyError('request_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) throw new RequestBodyError('request_body_missing', 400);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonLimited<T>(request: Request, maximumBytes: number): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim();
  if (contentType !== 'application/json') {
    throw new RequestBodyError('invalid_json', 400);
  }
  const bytes = await readRequestBodyLimited(request, maximumBytes);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new RequestBodyError('invalid_json', 400);
  }
}

export async function readSingleMultipartFile(
  request: Request,
  input: { maximumBytes: number; fieldName: string },
): Promise<File> {
  const contentType = request.headers.get('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    throw new RequestBodyError('invalid_multipart', 400);
  }

  const bytes = await readRequestBodyLimited(request, input.maximumBytes);
  let form: FormData;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    form = await new Response(copy.buffer, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new RequestBodyError('invalid_multipart', 400);
  }

  const files = [...form.entries()].filter(([, value]) => value instanceof File);
  const file = form.get(input.fieldName);
  if (!(file instanceof File) || files.length !== 1) {
    throw new RequestBodyError('invalid_multipart', 400);
  }
  return file;
}
