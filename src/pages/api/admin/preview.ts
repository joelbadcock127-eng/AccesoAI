import type { APIRoute } from 'astro';
import { isAuthed, unauthorized, json } from '../../../lib/admin/auth';
import { pageForRoute } from '../../../lib/admin/pages';
import { readFile } from '../../../lib/admin/store';
import { annotate } from '../../../lib/admin/html';
// Vite resolves this to the built (Tailwind-processed) stylesheet URL, so the
// preview head is assembled from known parts — never by fetching our own
// deployment (spec §2.3 / pitfalls §6).
import globalCssUrl from '../../../styles/global.css?url';

export const prerender = false;

// The page's hidden-until-animated states are all gated on an `html.js`
// class; the preview deliberately omits it so everything renders visible
// without the GSAP runtime (which would re-split text nodes and fight the
// editor's element addressing). These overrides open the few remaining
// collapsed states and stop smooth-scroll fighting scroll-to-field.
const PREVIEW_CSS = `
  html { scroll-behavior: auto; }
  .faq-a { max-height: none !important; opacity: 1 !important; overflow: visible !important; }
  [data-edit-hl] { outline: 2px solid #2C5CC5 !important; outline-offset: 3px; border-radius: 2px; }
`;

// Lives in <head> BEFORE the stylesheet link: a slow/hung stylesheet blocks
// any script that comes after it, which would silently kill the whole bridge.
const BRIDGE_SCRIPT = `
(function () {
  var ORIGIN = location.origin;

  function applyEdit(msg) {
    document.querySelectorAll('[data-edit-id="' + msg.domId + '"]').forEach(function (el) {
      if (msg.kind === 'image') {
        el.setAttribute('src', msg.value);
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
      } else {
        var node = el.childNodes[msg.childIndex];
        if (node && node.nodeType === 3) node.nodeValue = msg.value;
      }
    });
  }

  var hlTimer = null;
  function focusEdit(msg) {
    var el = document.querySelector('[data-edit-id="' + msg.domId + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    document.querySelectorAll('[data-edit-hl]').forEach(function (o) {
      o.removeAttribute('data-edit-hl');
    });
    el.setAttribute('data-edit-hl', '');
    clearTimeout(hlTimer);
    hlTimer = setTimeout(function () { el.removeAttribute('data-edit-hl'); }, 1600);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data) return;
    if (e.data.type === 'edit') applyEdit(e.data);
    if (e.data.type === 'focus') focusEdit(e.data);
  });

  // Clicks select the field in the panel and must never navigate (spec §4.4).
  // Send the whole ancestor chain of IDs; the panel focuses the first one
  // that actually has a field (e.g. an svg icon resolves to its button).
  document.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var candidates = [];
    var n = e.target;
    while (n && n.getAttribute) {
      var id = n.getAttribute('data-edit-id');
      if (id) candidates.push(id);
      n = n.parentNode;
    }
    if (candidates.length) parent.postMessage({ type: 'select', candidates: candidates }, ORIGIN);
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    // Static stand-in for the count-up animation so stat tiles read correctly.
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = el.getAttribute('data-count');
    });
    // Tell the panel we're ready so edits made while loading are replayed.
    parent.postMessage({ type: 'preview-ready' }, ORIGIN);
  });
})();
`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ cookies, url }) => {
  if (!isAuthed(cookies)) return unauthorized();

  const route = url.searchParams.get('page') ?? '/';
  const page = pageForRoute(route);
  if (!page) return json({ error: `Unknown page: ${route}` }, 404);

  const parts: string[] = [];
  for (const fileKey of page.files) {
    const file = await readFile(fileKey);
    parts.push(annotate(file.text, fileKey));
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Preview · ${esc(page.route)}</title>
<script>${BRIDGE_SCRIPT}</script>
<link rel="stylesheet" href="${esc(globalCssUrl)}">
<style>${PREVIEW_CSS}</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
};
