import type { APIRoute } from 'astro';
import { isAuthed, unauthorized, json } from '../../../lib/admin/auth';
import { pageForRoute, fileGroupPrefix } from '../../../lib/admin/pages';
import { readFile } from '../../../lib/admin/store';
import { extractFields } from '../../../lib/admin/html';

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url }) => {
  if (!isAuthed(cookies)) return unauthorized();

  const route = url.searchParams.get('page') ?? '/';
  const page = pageForRoute(route);
  if (!page) return json({ error: `Unknown page: ${route}` }, 404);

  const fields: unknown[] = [];
  const sources: Record<string, string> = {};

  for (const fileKey of page.files) {
    const file = await readFile(fileKey);
    sources[fileKey] = file.source;
    const prefix = fileGroupPrefix(fileKey);
    for (const f of extractFields(file.text)) {
      fields.push({
        ...f,
        file: fileKey,
        domId: `${fileKey}#${f.id}`,
        group: prefix ?? f.group,
      });
    }
  }

  return json({ page: page.route, fields, sources });
};
