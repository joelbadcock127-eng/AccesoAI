import type { APIRoute } from 'astro';
import { isAuthed, unauthorized, json } from '../../../lib/admin/auth';
import { listPages } from '../../../lib/admin/pages';
import { contentBranch, deployedCommit, repoSlug, storeMode } from '../../../lib/admin/store';

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAuthed(cookies)) return unauthorized();
  return json({
    pages: listPages().map(({ route, title }) => ({ route, title })),
    branch: contentBranch(),
    servingBranch: process.env.VERCEL_GIT_COMMIT_REF ?? 'dev',
    deployedCommit: deployedCommit(),
    repo: repoSlug(),
    mode: storeMode(),
  });
};
