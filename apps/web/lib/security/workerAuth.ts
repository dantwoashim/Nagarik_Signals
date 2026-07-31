import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedWorkerRequest(request: Request, expectedSecret: string): boolean {
  if (Buffer.byteLength(expectedSecret, 'utf8') < 32) return false;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(expectedSecret, 'utf8');
  return provided.byteLength === expected.byteLength && timingSafeEqual(provided, expected);
}
