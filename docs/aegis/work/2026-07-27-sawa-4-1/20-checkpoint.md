# Sawa 4.1 - Checkpoint

## Todo checkpoint

- Completed: repository and baseline inspection.
- Completed: 54 Vitest files / 152 tests pass in mono-worker mode.
- Completed sub-slice: storage v4 and Electron reliability boundaries for C1,
  C2, C6-C8 (archives, backups, shutdown, safe mode and defective media).
- Completed sub-slice: C3-C5 renderer mutation/settings/background-sync
  recovery, including Sawa and Kavita reader persistence.
- Completed sub-slice: identity/moves and canonical works/editions.
- Completed sub-slice: managed covers/crops and collection appearances.
- Completed sub-slice: preview sizing and adaptive quality.
- Completed sub-slice: per-tab multiple selection and safe physical deletion.
- Completed sub-slice: search redesign and per-tab search state.
- Completed: final E2E/performance verification, packaged smoke and installer.
- Completed: final holistic review and closure of persistence/CBZ findings.
- Current state: implementation and release artifact complete; no commit, push
  or publication performed.

## Resume state

Continue from the active dirty branch. Re-read this checkpoint and the approved
plan. Preserve all pre-existing performance changes. Inspect the latest diff
before editing an overlapping file.

## Change necessity

- User-visible need: the approved Sawa 4.1 reliability and UX functionality is
  absent or incomplete.
- No-change option: cannot satisfy the requested behavior.
- Why code is necessary: persisted schemas, IPC operations and renderer
  interactions must change.
- Minimum boundary: focused service and utility owners with wiring-only edits
  in main/preload/App where possible.
- Decision: code-change.

## Complexity budget

- Artifact class: Electron desktop application with shared persistence and UI.
- High-pressure owners: `electron/main.cjs`, `src/App.jsx`,
  `src/styles/globals.css`.
- Planned governance: extract services for archives, backups, identity, works,
  covers and search/selection helpers; keep owner files as orchestration.
- Budget result: at-risk but governed by extraction and per-slice tests.

## Drift check

- Scope: aligned with approved plan.
- Compatibility: v3 migration and legacy backup support remain mandatory.
- New owners: permitted only for responsibilities named in the plan.
- Decision: continue.

## Reliability review gate

- Spec review: approved after all transaction, cancellation and migration
  findings were closed.
- Code-quality review: approved with no remaining Critical or Important
  finding.
- Current verification: 62 Vitest files / 191 tests pass in mono-worker mode;
  `npm run build:web`, Node syntax checks and `git diff --check` pass.
- No commit, push or publication was performed.

## Renderer recovery review gate

- Optimistic mutations keep a confirmed baseline and isolate series, chapter
  and progress keys.
- Settings retries become stale no-ops after a newer success.
- Background refresh keeps visible data, retries three times and exposes a
  manual recovery action.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 67 Vitest files / 214 tests pass; production web build
  passes.

## Identity and editions review gate

- Exact moves require all-or-nothing SHA-256 content fingerprints computed in
  a bounded worker; partial or unreadable folders cannot auto-match.
- Probable and edition suggestions are revalidated at confirmation time.
- Public/private boundaries use the full vault privacy model, including private
  categories, even while the vault is unlocked.
- Reference remapping, canonical groups, ungrouping and stale revision guards
  are covered by focused tests.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 74 Vitest files / 248 tests pass; production web build
  passes.

## Covers and collections review gate

- Managed cover imports hash the exact temporary bytes that are fsynced,
  validated and atomically installed.
- Gallery discovery and legacy/page candidate scans run in the I/O worker.
- Portrait/banner crops are non-destructive, keyboard-persisted and guarded
  against stale responses.
- Manual and smart collection appearances are normalized, privacy-filtered and
  provide searchable/paginated featured selection with fallback.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 81 Vitest files / 269 tests pass; production web build
  passes.

## Preview quality review gate

- Chapter/page sizes are independent in Sawa and Kavita and exposed in both
  settings and view headers.
- Auto uses measured size times DPR; Economy/Net use bounded profiles.
- PDF rendering is globally limited and cancellable; image thumbnails are
  generated off-main by a packaged Sharp utility-process pool.
- Preview cards use contain without transform promotion; cache uses seven size
  buckets plus age/quota LRU eviction.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 84 Vitest files / 285 tests pass; production web build,
  `pack:dir`, development utility smoke and packaged-ASAR smoke pass.

## Multiple selection review gate

- Selection sessions are local to interface/tab/view and use the exact shared
  visible order for Dashboard, collections, virtual grids, vault and workbench.
- Bulk deletion starts an immediately correlated job, reports deltas, supports
  cancellation/partial retry and removes cards only after Windows Trash.
- Tombstones are minimal, strong-identity gated, non-overwriting and expire
  after 30 days.
- Deletion performs two canonical path-chain validations and rejects
  junction/reparse substitutions.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 90 Vitest files / 311 tests pass; production web build
  passes.

## Search redesign review gate

- Search is shared by Sawa/Kavita with per-tab scope/filters, local grouped
  suggestions, keyboard navigation, recent-search privacy and editable chips.
- Exact/prefix/alias/author/tag/collection ranking is accent/case tolerant with
  bounded light typo matching.
- Extended search is debounced and latest-only; stale query/scope/generation
  results cannot be displayed.
- Main-process privacy boundaries intersect all advanced/legacy requests with
  server-derived allowed references and return references only.
- A versioned migration purges ambiguous legacy searches once; private and
  incognito contexts never persist or enter recents.
- Spec review: APPROVED.
- Code-quality review: APPROVED; no remaining Critical or Important finding.
- Current verification: 94 Vitest files / 336 tests pass; production web build
  and the 499-item under-100-ms benchmark pass.

## Final release gate

- Final persistence retry and full CBZ export findings were repaired and
  independently re-reviewed.
- Final review: APPROVED; no Critical or Important finding remains.
- Current verification: 95 Vitest files / 342 tests, 13 Electron E2E tests and
  3 performance scenarios pass.
- Final measured p95: cold 1678 ms, warm 1438 ms, search 13 ms, selection
  55 ms; no renderer long task over 50 ms and no `unresponsive` event.
- Packaged app and native thumbnail utility smoke passed.
- `Sawa-Setup-4.1.0.exe` produced with version 4.1.0 and verified SHA-256; the
  artifact is not Authenticode-signed.
- Installer UI was observed responsive without performing a system install.
