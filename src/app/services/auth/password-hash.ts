// Offline credential hashing via Web Crypto PBKDF2-SHA256 (ported from
// zoulte-pos-ui's pin.ts). Runs in the Electron renderer; the same code path
// seeds the cache after an online login and verifies it during offline unlock.
// Never store a plain password or a token (see ws_user_cache.pwd_verifier).
//
// Stored format: pbkdf2$<iterations>$<saltB64>$<hashB64>
const ITERATIONS = 100_000;
const KEY_BITS = 256;

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Hash a password for storage in ws_user_cache.pwd_verifier. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Constant-time verify of a password against a stored verifier. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    return false;
  }
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') {
    return false;
  }
  const iterations = Number(iterStr);
  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  const actual = await derive(password, salt, iterations);
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}
