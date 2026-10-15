// The app password is never stored. We keep a salted PBKDF2 "verifier" so the lock
// screen can check a typed password; the password itself only lives in memory while
// the app is unlocked (and is used as the encryption key for encrypted trees).

export interface Verifier {
  salt: string; // base64
  iterations: number;
  hash: string; // base64
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
}

export async function makeVerifier(password: string, iterations = 210_000): Promise<Verifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), iterations, hash: b64(await derive(password, salt, iterations)) };
}

export async function checkPassword(password: string, v: Verifier): Promise<boolean> {
  const got = new Uint8Array(await derive(password, unb64(v.salt), v.iterations));
  const want = unb64(v.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Plain-English strength hint; we only insist on 8+ characters. */
export function passwordProblem(pw: string): string {
  if (pw.length < 8) return 'Use at least 8 characters.';
  return '';
}
