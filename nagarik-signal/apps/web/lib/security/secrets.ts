import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

export function secretsMatch(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}
