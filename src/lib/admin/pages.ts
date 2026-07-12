import { bundledPageKeys } from './store';

export interface PageDef {
  route: string;
  title: string;
  /** Content files composing the page, in render order. */
  files: string[];
}

const HEADER = 'partials/header.html';
const FOOTER = 'partials/footer.html';

function routeFor(pageKey: string): string {
  const name = pageKey.replace(/^pages\//, '').replace(/\.html$/, '');
  return name === 'index' ? '/' : `/${name}/`;
}

function titleFor(route: string): string {
  if (route === '/') return 'Home';
  const name = route.replace(/\//g, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Route → content-file map, auto-discovered from src/content/pages so new
 * pages appear in the editor automatically once deployed (spec §3).
 */
export function listPages(): PageDef[] {
  const pages = bundledPageKeys().map((key) => ({
    route: routeFor(key),
    title: titleFor(routeFor(key)),
    files: [HEADER, key, FOOTER],
  }));
  // Home first, then alphabetical.
  return pages.sort((a, b) =>
    a.route === '/' ? -1 : b.route === '/' ? 1 : a.route.localeCompare(b.route)
  );
}

export function pageForRoute(route: string): PageDef | undefined {
  const clean = route.replace(/\/+$/, '') || '/';
  return listPages().find((p) => (p.route.replace(/\/+$/, '') || '/') === clean);
}

/** Friendly group labels for the shared partials. */
export function fileGroupPrefix(fileKey: string): string | null {
  if (fileKey === HEADER) return 'Header';
  if (fileKey === FOOTER) return 'Footer';
  return null;
}
