import type { APIRoute } from 'astro';
import { isAuthed, unauthorized, json } from '../../../lib/admin/auth';
import { pageForRoute } from '../../../lib/admin/pages';
import { readFile, writeFile, contentBranch, storeMode, validFileKey } from '../../../lib/admin/store';
import { applyEdits, type Edit } from '../../../lib/admin/html';

export const prerender = false;

interface SaveEdit extends Edit {
  file: string;
}

export const POST: APIRoute = async ({ cookies, request }) => {
  if (!isAuthed(cookies)) return unauthorized();

  let body: { page?: string; edits?: SaveEdit[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const route = body.page ?? '/';
  const page = pageForRoute(route);
  if (!page) return json({ error: `Unknown page: ${route}` }, 404);

  const edits = Array.isArray(body.edits) ? body.edits : [];
  if (edits.length === 0) return json({ error: 'No edits submitted' }, 400);

  // Group edits per content file; each file gets one commit.
  const byFile = new Map<string, SaveEdit[]>();
  for (const e of edits) {
    if (!validFileKey(e.file) || !page.files.includes(e.file)) {
      return json({ error: `Edit targets a file outside this page: ${e.file}` }, 400);
    }
    if (typeof e.value !== 'string' || (e.kind !== 'text' && e.kind !== 'image')) {
      return json({ error: 'Malformed edit' }, 400);
    }
    const list = byFile.get(e.file) ?? [];
    list.push(e);
    byFile.set(e.file, list);
  }

  const commits: { file: string; sha: string | null }[] = [];
  const skipped: { file: string; id: number; reason: string }[] = [];
  let totalApplied = 0;
  let mode = storeMode();

  try {
    for (const [fileKey, fileEdits] of byFile) {
      // Concurrent-change safety: always apply against a fresh fetch (spec §4.8).
      const current = await readFile(fileKey);
      if (current.source === 'bundled') {
        return json(
          {
            error:
              'GITHUB_TOKEN is not configured on the server, so edits cannot be committed. Add it in Vercel → Settings → Environment Variables.',
          },
          500
        );
      }
      const result = applyEdits(current.text, fileEdits);
      for (const s of result.skipped) skipped.push({ file: fileKey, ...s });
      if (result.applied === 0) continue;

      const changes = `${result.applied} change${result.applied === 1 ? '' : 's'}`;
      const write = await writeFile(
        fileKey,
        result.html,
        current.sha,
        `Admin edit: ${page.route} (${changes})`
      );
      mode = write.mode;
      commits.push({ file: fileKey, sha: write.commitSha });
      totalApplied += result.applied;
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  if (totalApplied === 0) {
    return json(
      {
        error:
          'None of your edits could be applied — the content has changed underneath you. Reload the page and re-apply your changes.',
        conflict: true,
        skipped,
      },
      409
    );
  }

  return json({
    ok: true,
    applied: totalApplied,
    skipped,
    commits,
    lastCommit: commits.length ? commits[commits.length - 1].sha : null,
    branch: contentBranch(),
    servingBranch: process.env.VERCEL_GIT_COMMIT_REF ?? 'dev',
    mode,
  });
};
