# Sawa 4.1 - Evidence

## Baseline

- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 54 test files passed, 152 tests passed.
- Note: the default parallel run previously lost a Vitest worker without an
  assertion failure; mono-worker verification is stable.

## Electron reliability slice

- Storage/session migrated to v4 with a covered v4 round trip.
- CBZ export, backup packaging, cover replacement and recovery run through
  bounded workers with cancellation and progress.
- Backup import is serialized and journaled across state/cover replacement.
- Safe mode loads the last valid snapshot read-only.
- PDF and media paths are constrained by real paths, configured roots and a
  bounded size before reading.
- Final focused review commands passed, including archive cancellation,
  backup crash recovery, worker shutdown and PDF boundary tests.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 62 test files passed, 191 tests passed.
- Command: `npm run build:web`
- Result: passed, 1704 modules transformed.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Identity and editions slice

- Added bounded worker SHA-256 fingerprints, exact/probable/ambiguous
  classification and structured media diagnostics.
- Added exhaustive identity remapping, canonical work groups, preferred
  editions, safe ungrouping and one-card projections for Sawa and Kavita.
- Locked-vault payloads and identity/work IPC responses strip private records,
  suggestions, groups and diagnostics.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 74 test files passed, 248 tests passed.
- Command: `npm run build:web`
- Result: passed.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Covers and collections slice

- Added managed SHA-256 cover variants, portable profiles and independent
  portrait/banner crops without modifying source or legacy files.
- Added a shared Sawa/Kavita cover manager and four collection appearances with
  live preview, searchable featured selection and missing-cover fallback.
- Cover gallery discovery runs off-main; candidate paths are canonicalized and
  revalidated in the worker.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 81 test files passed, 269 tests passed.
- Command: `npm run build:web`
- Result: passed, 1714 modules transformed.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Preview quality slice

- Added independent chapter/page sizes and Economy/Auto/Net profiles for Sawa
  and Kavita.
- Auto measures actual rendered dimensions with a bounded observer before
  applying DPR.
- PDF renders use a cancellable global limit of two; image thumbnails are
  generated outside the main process in a packaged Sharp utility pool.
- Cache is bucketed and bounded by age and a 512 MiB LRU quota.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 84 test files passed, 285 tests passed.
- `npm run build:web` and `npm run pack:dir`: passed.
- Packaged ASAR utility smoke: `THUMBNAIL_UTILITY_OK bytes=136`.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Multiple selection and deletion slice

- Added per-interface/tab/view selection sessions with Ctrl/Shift ranges over
  complete virtual ordering, hidden counts and shared Sawa/Kavita actions.
- Bulk Trash returns a job id immediately, emits job deltas, supports
  cancellation and retries only failed current paths.
- Individual and bulk deletion share canonical path validation, Windows Trash
  confirmation and 30-day strong-identity tombstones.
- Job history is pruned to 200 terminal jobs or 30 days.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 90 test files passed, 311 tests passed.
- Command: `npm run build:web`
- Result: passed, 1720 modules transformed.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Search redesign slice

- Added one shared Sawa/Kavita search experience with per-tab query, scope and
  filter state; grouped suggestions, recent searches, keyboard navigation and
  zero-result recovery.
- Added a compact local ranked index plus a debounced latest-only extended
  search fallback.
- Locked/stealth vault filtering is enforced in Electron for advanced and
  legacy IPC; only server-authorized references cross the boundary.
- Added privacy migration and exit neutralization for legacy/private/incognito
  search state.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 94 test files passed, 336 tests passed.
- Command: `npm run build:web`
- Result: passed, 1723 modules transformed.
- Representative search benchmark: 499 items under 100 ms p95.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Renderer recovery slice

- Added pure controllers for optimistic mutations, field-scoped settings
  persistence and revision-aware background refresh.
- Sawa and Kavita reader progress/settings surface failed writes with details
  and local retry instead of swallowing rejections.
- Confirmed-baseline tests cover chained failures, late success, stale retry
  invalidation and concurrent chapter updates.
- Command: `npm test -- --reporter=dot --maxWorkers=1 --minWorkers=1`
- Result: 67 test files passed, 214 tests passed.
- Command: `npm run build:web`
- Result: passed, 1708 modules transformed.
- Independent spec review: APPROVED.
- Independent code-quality review: APPROVED; no Critical or Important finding.

## Final release verification

- Final persistence review found and closed a retry-loss defect: failed atomic
  writes remain queued, confirmed caches update only after success, and a later
  explicit flush clears the transient error after persistence succeeds.
- Final CBZ review found and closed incomplete UI/metadata coverage: the
  metadata editor now exports either one selected chapter or one CBZ per manga
  chapter, with rename/replace/skip policies and chapter-specific
  `ComicInfo.xml`.
- Independent holistic review after fixes: APPROVED; no remaining Critical or
  Important finding.
- Command: `npm test -- --maxWorkers=1 --minWorkers=1`
- Result: 95 test files passed, 342 tests passed.
- Command: `npm run test:e2e`
- Result: 13 Electron tests passed across Sawa and Kavita.
- Command: `npm run test:perf`
- Result: 3 tests passed; cold p95 1678 ms, warm p95 1438 ms, light mutation
  p95 0 ms, search p95 13 ms, selection p95 55 ms, zero renderer long task
  over 50 ms and zero `unresponsive` event.
- Command: `npm run pack:dir`
- Result: passed; packaged Sharp utility smoke returned
  `THUMBNAIL_UTILITY_OK bytes=136`.
- Packaged application smoke: responsive window titled
  `Bibliotheque - Sawa Manga Library`, state file created with version 4.
- Command: `npm run dist:installer`
- Result: passed; produced `release-installer/Sawa-Setup-4.1.0.exe`.
- Installer verification: 173222509 bytes, file/product version 4.1.0,
  SHA-256 `BE69AAA3FD47D9583E37462AE0FC23A8A78CBFDDC71819719B16B1B93BDAA51D`,
  Authenticode `NotSigned`.
- Installer UI smoke observed a responsive
  `Sawa Manga Library — Setup` window and closed it without performing a real
  installation. The helper returned 1 during Electron child-process cleanup,
  so this is recorded as direct observed evidence rather than a fully green
  automated install/uninstall test.
