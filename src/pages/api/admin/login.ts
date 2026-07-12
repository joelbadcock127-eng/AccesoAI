import type { APIRoute } from 'astro';
import { verifyPassword, setSession, json } from '../../../lib/admin/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  let password = '';
  try {
    const body = await request.json();
    password = body?.password ?? '';
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!process.env.ADMIN_PASSWORD && !import.meta.env.ADMIN_PASSWORD) {
    return json({ error: 'ADMIN_PASSWORD is not configured on the server.' }, 500);
  }

  if (!verifyPassword(password)) {
    return json({ error: 'Wrong password — try again.' }, 401);
  }

  setSession(cookies, url);
  return json({ ok: true });
};
