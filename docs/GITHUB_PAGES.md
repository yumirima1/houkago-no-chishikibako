# GitHub Pages UI

The public UI is deployed only through `.github/workflows/pages.yml` to
https://yumirima1.github.io/houkago-no-chishikibako/ . Vercel is not part of this workflow.

## Diagnosis (2026-10-26)

The repository's Pages settings were `build_type: legacy`, source
`experiment/broadcast-room:/`. The successful run 40309314326 deployed commit
`a6ef01d2a9b3889c9f7292592d613778dce6e744` with Jekyll. The public URL returned
the README and contained no canvas in Chrome. The newer Observer Room exists on
`chore/rename-kousatsu` at `b9e8f4f609934aa58a0649906b139f589903369e`.

## Build and separation

Run `npm run build:pages`, then `node scripts/verify-pages-artifact.mjs`.
The build creates an isolated staging app under `tmp/`, preserves the original
server app, and exports to `out/`. A previous `out/` is retained under `tmp/`.

- `output: export`, `trailingSlash: true`, base path `/houkago-no-chishikibako`.
- Public `/` and `/observer-room/` both show the existing ObserverStudyRoot.
- JS/CSS, GLBs, the GLBs' relative PNG dependency and fonts use the repository prefix.
- Only room models/textures and fonts are included from public assets. Legacy
  audio archives and local research data are not required or published.
- Server API routes and the server-only export utility are excluded from the
  staging app. They remain intact in the original local app.
- The public desktop displays that local research data is not connected and does
  not fetch a nonexistent Pages API. The local desktop retains its existing API.
- `build-info.json` identifies the deployed commit, branch and base path.
- Existing local `npm run dev` / `npm run build` do not enable the Pages target.

## Deployment

Pushes to `fix/github-pages-observer-room` or `main` run the Pages workflow.
The first deployment uses the dedicated fix branch; the existing local worktree
and `chore/rename-kousatsu` branch are preserved. Pages must use GitHub Actions
(`build_type: workflow`). The `github-pages` environment must allow the deployment
branch. No secrets or paid deployment service is needed.

CI uses Node 24, the committed npm lockfile, generated Next route types, typecheck, ESLint, the full existing
test suite, the static build and artifact validation before uploading/deploying.
It prepares `tmp/` before the existing autonomous fixtures create their isolated databases.
`pages: write` and `id-token: write` apply only to the deploy job.

## Verification and rollback

Browser evidence is saved outside the repository at
`D:\AI\Archives\pages-verification-20261026`.
Compare `build-info.json` with the successful Actions run SHA. Test both the root
and the direct room URL with real Chrome, including WebGL, CRT open/close,
asset responses, console errors and the absence of backend requests.

Rollback by redeploying a previously successful Pages artifact. Before the first
Actions deployment the recoverable legacy settings were the source and commit
recorded above; switching back to legacy would restore the old README site,
not the Next.js UI. Do not reset or discard local work to roll back a deployment.

The visual/weather/clock requests are deferred while establishing this public
initial display. The requested weather location is Fukuoka City; no geolocation
request or weather data transmission has been added in this change.

## Pre-deployment results

- Full existing suite: 215 passed. Typecheck, local server build, Pages export
  and artifact validation passed. ESLint has no errors; an existing unused `op`
  warning remains in `weekly-store.ts`.
- Real Chrome 155 / GTX 1650 rendered the static artifact at the actual repository
  prefix, at 1440×900. All 14 GLBs, the PNG and fonts loaded without failed requests.
- CRT opened, all three public app notices displayed, and Escape returned to the
  room. No API requests, console errors or uncaught errors occurred.
- Mouse movement changed the CRT crop; returning to center restored it to a mean
  pixel difference of 0.001/255. The 3-second frame sample averaged 60.4 FPS.
- The only remaining browser warning was the dependency's deprecated THREE.Clock.
  Explicit PCF shadow configuration removed the separate shadow-map warning.
- The original port-3000 development process (PID 22180) was not stopped/restarted.

Run `scripts/verify-pages-browser.mjs --url <site-url> --dependencies <isolated
playwright-core-directory> --output <evidence-directory>` after deployment. The
published verification report and screenshots identify the real URL and outcome;
local preview success alone is not the deployment completion condition.
