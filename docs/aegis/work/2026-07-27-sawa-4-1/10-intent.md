# Sawa 4.1 - Intent

## Requested outcome

Implement the approved Sawa 4.1 plan: C1-C8 reliability fixes, content move
recognition, canonical works and editions, managed covers, collection appearance
modes, preview sizing and quality, multi-selection, search, tests, and the
Windows 4.1 installer.

## Scope and non-goals

- Preserve the current performance and scroll-stability baseline.
- Keep all new library/search behavior local-first.
- Do not silently merge probable identities or editions.
- Do not modify source manga files except explicit CBZ export or confirmed
  Windows Recycle Bin operations.
- Do not commit, push, publish, or sign artifacts.

## Baseline read set

- Approved Sawa 4.1 plan in the active task.
- Current dirty feature branch `codex/sawa-performance-stability`.
- Existing storage, scanner, preload, App, Sawa/Kavita list and media code.
- Existing performance, persistence, scroll and Electron E2E tests.

## Baseline usage

- The dirty worktree is the required baseline because it contains the approved
  performance and scroll-stability implementation.
- Existing user changes must be preserved.
- Baseline verification: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
  passed 54 files and 152 tests on 2026-07-27.

## Impact statement

The change affects persisted state, IPC contracts, filesystem operations,
library identity, renderer interaction models, packaged resources, and the
Windows release artifact. Compatibility with v3 state and legacy JSON backups
is mandatory.

## Execution readiness

- Intent lock: implement the approved plan without dropping C1-C8 or features
  5, 8, 61, 62 and 63.
- Scope fence: local Electron application and its installer only.
- Compatibility boundary: v3 state, current preload callers, existing manga
  folders and legacy backups.
- Test obligations: focused unit tests per owner, complete Vitest, Electron E2E,
  performance suite, production build, packaged smoke test and installer.
- Review gates: specification review, code-quality review and final holistic
  review.
- Drift rule: new responsibilities belong in focused services/utilities; avoid
  adding substantial logic directly to overloaded `electron/main.cjs` or
  `src/App.jsx`.

## TDD route

- Mode: off
- Decision: skipped
- Strict authority: none requested
- Test posture: proportional regression tests plus full verification

