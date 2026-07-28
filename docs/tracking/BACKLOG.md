# BACKLOG — Zoulte Scale

Canonical pending-work list. Phase definitions live in docs/IMPLEMENTATION_PLAN.md §4.
Status as of 2026-07-27: Phases 0, 1, 2, 3, 5 built & verified (see MASTER_RUNBOOK).

## Now (unblocked — next up)

- **Phase 6 — Daily balance check** (no external blockers; §211.68 story):
  - Guided wizard: stable zero → place check weight N → auto-capture off the
    stream (never typed) → pass/fail per point → overall record + operator sign.
  - Records through the existing offline pipeline (`ws_balance_check` table
    already in schema v1; BALANCE_CHECK outbox type already mirrors).
  - Capture gating on the weighing screen: no pass today → blocked banner;
    FAIL → hard block, clearable only by QA role (cleared_by/cleared_at).
  - Check-weight cert IDs + expiry warnings at 30 days.
  - Config (points/nominals/tolerances) comes from customer SOP — screens can
    ship with config UI first, numbers filled in when QA answers §6.3.
- **Owner UI/UX pass** on the redesigned weighing screen (`npm run electron:dev`)
  against the ≥7.75 bar — iterate on findings.
- **Manual hardware/backend verification** — checklist in SESSION_HANDOFF.md
  (real scale auto-grant + stability, live sync drain, offline→online replay,
  offline unlock end-to-end).
- **Commit checkpoint** — everything is uncommitted working tree; owner commits
  explicitly (global working-style rule).

## Blocked by backend (xaur-sfa `ws_*` module — build as relocatable per D-10, F-002)

Backend tasks, in priority order:
1. VOID endpoint → then flip `'VOID'` into SUPPORTED_ENTITY_TYPES in
   `src/app/services/sync/cloud-client.ts` (one line, events already queue).
   While creating the ws_reading table for this: add the unique index on
   reading_uuid + insert-ignore (idempotent ingest). Owner decision 2026-07-27:
   NOT urgent standalone work — dupe window is timeout-then-retry only, F-004
   stays monitored — but it's ~free at table-creation time and expensive to
   retrofit after dupes exist, so it rides with the first backend batch.
3. Nominal weight ± tolerance on product master → wire the capture-time
   tolerance check (tolerance_flag column + acknowledge-or-void UX designed,
   not wired — no data source yet).
4. Simplified product-create endpoint (≤5 fields, rest defaulted) + per-tenant
   seeds: default category + three app roles (OPERATOR/VERIFIER/ADMIN).
5. Balance-check, verification, audit ingest endpoints; `verified_by`/
   `verified_at` in both report endpoints; server time in sync ack (enables
   `captured_at_server` clock-drift stamping).

Frontend phases gated on the above:
- **Phase 4 — Masters & Setup area** — PARTIALLY DONE 2026-07-28: /setup with
  product + category create/list over legacy xaur-core /sf/api/cr/inv/*
  endpoints (same cr_material_* tables the OMS catalog uses; paths isolated in
  material-api.service.ts for the later /cat/api catalog-engine switch).
  Remaining:
  - Verify list-endpoint DTO field names against the live server (built from
    entity reading, not a live call — materialcategorys/products row shapes).
  - User management screens (create/deactivate/password-reset/role-change over
    xaur-core sec APIs) + per-tenant role/menu seeding.
  - Server menu config: Administration→Setup entry for module xaur-scale with
    WRITE priv → then remove the client-side sidebar append + gate by role.
  - Default category seeding per tenant.
  - Session-card free-text → product picker + admin quick-add; offline
    pullDomain('PRODUCT'|'CATEGORY') into ws_product_cache/ws_category_cache.
- **Phase 7 — Verification & signatures** (needs QA §6.1/6.2 + item 5):
  `/verification` per-batch queue, exception-first display, re-auth signing
  w/ signature meaning ("Records reviewed"), verifier ≠ operator enforcement,
  Unverified/Verified/Rejected chips on weighing screen, verified-by columns
  + unsynced-count caveat in reports.

## Waiting on people

- **Customer QA answers** (IMPLEMENTATION_PLAN §6): verification basis
  (records-review vs right-thing-weighed → decides witness/photo mode),
  Part 11 e-signature requirement, balance-check SOP (points/weights/
  tolerances/frequency), retention + backup expectations, exact scale models
  (serial protocol sheets → Z/T/S command support).

## Phase 8 — Hardening & ops (tail)

- electron-builder Windows installer + auto-update (deferred from Phase 1;
  until then `npm run electron:start`).
- Kiosk mode + auto-start on boot (fullscreen already; kiosk flag pending).
- Local DB backup/retention story (ws.db in userData — no backup yet).
- PIN-protected Settings screen: scale VID/PID (currently code-level in
  electron/station-config.js + scale-device.config.ts), baud, API base URL,
  balance-check config.
- Reports: offline empty-states + "N local readings not yet synced" caption.
- URS + Part 11 mapping doc for the customer's CSV/GAMP validation package.

## Small known gaps

- Weighing session not persisted across app restart (in-memory; move to
  ws_config if operators complain).
- Login `?expired=1` shows a banner, but a session expiring mid-capture drops
  unsaved session context — acceptable (captures are already durable).
- ESLint + prettier + husky per angular-skills §19 not stood up; `lint` script
  absent.
- Vitest migration parked (FINDINGS F-001) — Karma/Jasmine is current runner.

## Deferred / trigger-based

- node-serialport behind the same ScaleSerialService interface — only if Web
  Serial-in-Electron proves flaky on shop-floor hardware.
- Photo evidence at capture (webcam frame per reading) — if QA answers
  "right thing weighed" to §6.1.
- Witness-at-scale countersign mode — same trigger.
- Repeatability (10×) balance test wizard — after Phase 6 daily check ships.
- @zoulte/shell adoption — only if a back-office module is ever added (D-2).
- SFA → OMS relocation of the backend module — planned, non-blocking (D-10).
