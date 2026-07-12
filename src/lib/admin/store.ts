/**
 * Content store: the git repository is the database (spec §1).
 *
 * - Reads come from the GitHub contents API when a token is configured, so
 *   the editor always sees the latest committed content; without a token it
 *   falls back to the copy bundled at build time (read-only).
 * - In local dev the store reads/writes the files on disk directly, so the
 *   editor can be exercised end to end without touching GitHub.
 * - Writes always re-fetch the current file first (done by the save endpoint)
 *   and commit through the API to the branch the deployment was built from.
 */

const RAW_FILES = import.meta.glob('../../content/**/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** fileKey is repo-relative under src/content, e.g. "pages/index.html". */
export function bundledFile(fileKey: string): string | null {
  for (const [path, text] of Object.entries(RAW_FILES)) {
    if (path.endsWith(`/content/${fileKey}`)) return text;
  }
  return null;
}

export function bundledPageKeys(): string[] {
  return Object.keys(RAW_FILES)
    .filter((p) => p.includes('/content/pages/'))
    .map((p) => p.slice(p.indexOf('/content/') + '/content/'.length))
    .sort();
}

const env = (name: string): string | undefined =>
  process.env[name] || (import.meta.env as Record<string, string | undefined>)[name];

export const repoSlug = () => env('GITHUB_REPO') || 'joelbadcock127-eng/AccesoAI';

/** Branch edits are committed to: override, else the branch this deployment was built from. */
export const contentBranch = () =>
  env('CONTENT_BRANCH') || env('VERCEL_GIT_COMMIT_REF') || 'main';

export const deployedCommit = () => env('VERCEL_GIT_COMMIT_SHA') || 'dev';

const githubToken = () => env('GITHUB_TOKEN');

export const isDev = () => import.meta.env.DEV;

export type StoreMode = 'github' | 'local' | 'bundled';

export function storeMode(): StoreMode {
  if (isDev()) return 'local';
  return githubToken() ? 'github' : 'bundled';
}

const repoPath = (fileKey: string) => `src/content/${fileKey}`;

// fileKey values come from client requests; keep them strictly inside src/content.
export function validFileKey(fileKey: string): boolean {
  return /^(pages|partials)\/[a-zA-Z0-9._-]+\.html$/.test(fileKey);
}

export interface FileRead {
  text: string;
  sha: string | null;
  source: StoreMode;
}

async function githubApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'accesoai-admin-editor',
      ...(init?.headers ?? {}),
    },
  });
}

export async function readFile(fileKey: string): Promise<FileRead> {
  if (!validFileKey(fileKey)) throw new Error(`Invalid file key: ${fileKey}`);

  if (isDev()) {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(new URL(`../../content/${fileKey}`, import.meta.url), 'utf8');
    return { text, sha: null, source: 'local' };
  }

  if (githubToken()) {
    const res = await githubApi(
      `/repos/${repoSlug()}/contents/${repoPath(fileKey)}?ref=${encodeURIComponent(contentBranch())}`
    );
    if (res.ok) {
      const data = await res.json();
      const text = Buffer.from(data.content, 'base64').toString('utf8');
      return { text, sha: data.sha, source: 'github' };
    }
    // Fall through to the bundled copy so the editor still loads; save will
    // surface the real error.
  }

  const bundled = bundledFile(fileKey);
  if (bundled === null) throw new Error(`Unknown content file: ${fileKey}`);
  return { text: bundled, sha: null, source: 'bundled' };
}

export interface WriteResult {
  commitSha: string | null;
  branch: string;
  mode: StoreMode;
}

export async function writeFile(
  fileKey: string,
  text: string,
  sha: string | null,
  message: string
): Promise<WriteResult> {
  if (!validFileKey(fileKey)) throw new Error(`Invalid file key: ${fileKey}`);

  if (isDev()) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(new URL(`../../content/${fileKey}`, import.meta.url), text, 'utf8');
    return { commitSha: null, branch: 'local', mode: 'local' };
  }

  if (!githubToken()) {
    throw new Error(
      'GITHUB_TOKEN is not configured on the server, so edits cannot be committed.'
    );
  }

  const res = await githubApi(`/repos/${repoSlug()}/contents/${repoPath(fileKey)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(text, 'utf8').toString('base64'),
      branch: contentBranch(),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub commit failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return { commitSha: data.commit?.sha ?? null, branch: contentBranch(), mode: 'github' };
}
