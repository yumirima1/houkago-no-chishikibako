# Observer Room: right-wall window and continuous traffic

## Investigated state (2026-10-28)

The original checkout is `chore/rename-kousatsu` at `9d4744f`, with existing
uncommitted room and backend work. It has not been reset or overwritten. This
change continues in the isolated `tmp/observer-room-final-20261028` worktree,
on `fix/observer-room-final-20261028`, from published main `0f49f41`.

The previous room implementation (`2d7a499`, followed by test correction
`0f49f41`) was already deployed. Actions run 40668336969 completed build,
deploy, and public verification successfully; its public browser run passed
13 tests. There is no evidence of a failed deployment or an unfinished
application process causing the previously reported interruption. A final
completion report had not been delivered. The new right-side placement
supersedes the earlier reference image's left/front window.

Actual defects found: traffic returned early for reduced motion, the Canvas
used demand rendering in that mode, and per-frame delta caps slowed traffic
on low-FPS devices. Previous tests switched to normal motion before testing
movement and checked only a start/end displacement. Same-lane cars used
different speeds and could catch each other over time.

## Implementation

- React Three Fiber/Three.js remains the renderer. `WINDOW_FRAME` rotates the
  existing window's local coordinates onto the right wall (`world X = 3.8`).
  Opening, fixed/sliding sashes, sill, blinds, glass condensation, outside rain,
  stencil mask, buildings, sky, viaduct, rails and road all share the transform.
  The former opening is a solid front wall. The desk and both CRTs remain inside
  the room; neither touches the side window. Two portrait e-paper panels and
  their independent local image settings/persistence are retained.
- The desktop camera faces the desk and right window. Portrait mobile uses a
  wider angle and stationary view toward the window, while the existing phone
  approaches the camera and its reader remains a separate mobile UI.
- Existing train/car `useFrame` callbacks accumulate full active elapsed time.
  Reduced motion uses 35% traffic speed; camera motion/rain retain their reduced
  behavior. No new timer, animation loop, listener, dependency or backend code.
  R3F stops/restarts its clock when Canvas changes to/from `never`; per-vehicle
  elapsed refs persist across terminal/visibility changes and resize.
- Train moves forward at 1.45 world units/sec, with an 80-unit cycle. Cars use
  opposite lanes at 1.6/1.8 units/sec, a 70-unit cycle and fixed same-lane
  separation. Road and bridge share a diagonal corridor; wheels rest at road
  level and bridge supports stand outside the lanes.

## Verification and release

The existing typecheck, lint, regression, normal build, Pages build and browser
scripts are used. Added unit tests compare 2/5/15/60/144 FPS and many cycles.
Added browser tests measure actual rendered positions and frame timestamps in
normal, reduced and touch modes; they also check aperture/viewport projection,
lane direction, separation, modal pause/resume, resize and a real train loop.
Before/after screenshots and measurement JSON are retained with test results.

GitHub Pages is the canonical public archive, built/deployed from main by
`.github/workflows/pages.yml`, followed by a public browser verification job.
Vercel also follows main; its private backend access restriction is preserved.
No force push, dependency changes or unrelated user edits are included.

Final execution results, deployed SHA and public verification time belong in
the completion report. Browser screenshots/emulation do not constitute tests
on physical iOS/Android devices or human evaluation of speaker sound.
