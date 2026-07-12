# Live Content Editor (`/admin`)

A password-protected visual editor for every piece of text and every image on
the site, served from the site itself at **`/admin`**.

## How it works

- All human-editable content lives in plain HTML files under
  `src/content/` — one file per page (`pages/index.html`, `pages/services.html`,
  `pages/about.html`) plus the shared header and footer
  (`partials/header.html`, `partials/footer.html`). The Astro pages and layout
  render these files verbatim; page `<title>`s, meta descriptions, and JSON-LD
  stay in the `.astro` files.
- The editor shows one field for every visible text node and every image on
  the selected page, grouped by section. Typing updates the live preview
  instantly; clicking anything in the preview jumps to its field.
- **Saving creates a git commit** through the GitHub API — the repository is
  the database. Vercel then rebuilds and deploys as it would for any commit,
  and the editor tracks the deploy until the change is verifiably live
  (it compares the `x-build-commit` meta tag baked into every page at build
  time). Edits are committed to the branch the current deployment was built
  from, so the URL you're editing is the URL that updates.
- Every edit is attributable, revertible, and auditable through ordinary git
  history (`Admin edit: /about/ (3 changes)`).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Value |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | The password for `/admin`. Pick something long and random. |
| `GITHUB_TOKEN` | Yes | A GitHub fine-grained personal access token that can write to this one repository (see below). |
| `GITHUB_REPO` | No | Defaults to `joelbadcock127-eng/AccesoAI`. Only set if the repo moves. |
| `CONTENT_BRANCH` | No | Overrides the branch edits are committed to. By default edits go to the branch the deployment was built from (`VERCEL_GIT_COMMIT_REF`), which is what you want. |

The editor also relies on Vercel's automatic system variables
(`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`). These are exposed when
**Settings → Environment Variables → "Automatically expose System Environment
Variables"** is enabled (it is by default).

### Creating the GitHub token

1. GitHub → your avatar → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → *Generate new token*.
2. **Repository access**: *Only select repositories* → choose this repo only.
3. **Permissions** → *Repository permissions* → **Contents: Read and write**.
   Nothing else is needed.
4. Set an expiry you're comfortable with, generate, and copy the token into
   the `GITHUB_TOKEN` variable on Vercel (all environments), then redeploy.

## Notes

- All admin API routes return 401 when logged out; `/admin` is `noindex` and
  disallowed in `robots.txt`.
- Without `GITHUB_TOKEN` the editor still opens in read-only mode (it shows the
  content bundled into the deployment) but saving is disabled with a clear
  error.
- In local dev (`npm run dev` with `ADMIN_PASSWORD=… `), saves write directly
  to the files in `src/content/` instead of committing.
- The first programmatic save may normalise HTML formatting (attribute quotes,
  self-closing tags), so the first diff can look bigger than the edit. The
  content files have been pre-normalised to minimise this.
