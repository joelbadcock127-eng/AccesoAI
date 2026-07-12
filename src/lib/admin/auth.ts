import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

export const SESSION_COOKIE = 'acceso_admin_session';
const SESSION_LABEL = 'accesoai-admin-session-v1';

function adminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD;
}

/** Deterministic session token derived from the password via HMAC. */
export function sessionToken(): string | null {
  const pw = adminPassword();
  if (!pw) return null;
  return createHmac('sha256', pw).update(SESSION_LABEL).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  // Hash both sides so lengths always match for timingSafeEqual.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verifyPassword(candidate: string): boolean {
  const pw = adminPassword();
  if (!pw || typeof candidate !== 'string') return false;
  return safeEqual(candidate, pw);
}

export function isAuthed(cookies: AstroCookies): boolean {
  const expected = sessionToken();
  const got = cookies.get(SESSION_COOKIE)?.value;
  if (!expected || !got) return false;
  return safeEqual(got, expected);
}

export function setSession(cookies: AstroCookies, url: URL) {
  cookies.set(SESSION_COOKIE, sessionToken()!, {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
