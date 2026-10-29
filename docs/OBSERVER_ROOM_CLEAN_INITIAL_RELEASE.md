# Observer Room clean initial view release (2026-10-30)

This release applies the approved display repair to production main `e9b6747`,
preserving the newer right-wall window, first-person camera, continuous traffic,
two CRTs, e-paper image persistence, public archive and current deployment workflow.
The original dirty checkout and unrelated backend work remain untouched.

The root page now consistently mounts the existing Observer Room. Initial room
controls, terminal entry buttons and the floating phone are removed at their
rendering sources. The mobile timer no longer opens a terminal over the room.
The CRT and sliding window remain directly interactive, and Enter on the room
region retains keyboard access without an extra button. The shared terminal,
audio graph and e-paper settings remain available after deliberate entry.

Only the page/root/scene and obsolete entry-button CSS change in application
code. No scene geometry, camera parameters, assets, traffic motion, data, backend,
MCP configuration, dependencies or credentials are replaced in this UI release.

Browser tests use deliberate entry instead of removed controls or automatic
opening. Coverage includes no initial UI, existing assets and WebGL rendering,
desktop and touch interaction, resize/reload, archive reading, e-paper
persistence, sound mixing and real traffic. The repository's standard GitHub
Pages workflow remains the deployment path, using its dynamic repository-name
base path and actual deployment URL for public verification.

Before release, the live build-info reported `/kousatsubako` while the current
repository and Pages URL were `/houkago-no-chishikibako`. A fresh workflow build
uses the current repository name, avoiding publication of that stale artifact.
The existing Git credential is reused; no new account or authentication is made.

Validation logs and final deployment evidence are retained outside Git at
`D:/AI/KousatsuData/Validation/observer-room-publish-20261030/`.
