export async function sha256Hex(input: string | ArrayBuffer | Uint8Array) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput.buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function shortHash(value: string, left = 8, right = 8) {
  if (!value) return 'missing';
  return value.length <= left + right + 3 ? value : `${value.slice(0, left)}...${value.slice(-right)}`;
}
