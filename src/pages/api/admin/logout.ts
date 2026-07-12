import type { APIRoute } from 'astro';
import { clearSession, json } from '../../../lib/admin/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  clearSession(cookies);
  return json({ ok: true });
};
