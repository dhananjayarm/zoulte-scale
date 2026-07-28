# Implementation Plan — Zoulte Scale (zoulte-scale → Electron)

Status: **draft for review** · Owner: Dhananjaya · Last updated: 2026-07-27

Turn the current web-only weighing app into an **offline-first Electron desktop
station** for pharma QC weighing: device-sourced capture, local SQLite with
outbox sync, offline unlock, daily balance checks, second-person verification,
and an immutable audit trail — designed to *support* 21 CFR 211 / Part 11
compliance (the customer's QA validates; we make the system validatable).

---

## 1. Standing decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | **Rework this repo — no greenfield.** | Already Angular 21 + standalone + signals. The hard-won asset (`scale-serial.service.ts` parser + stability inference) survives as-is. Electron wraps the app; it doesn't replace it. |
| D-2 | **Do NOT adopt `@zoulte/shell` / `@zoulte/auth`.** | Proven by precedent: zoulte-pos-ui adopted shell (UI2-shell) and **removed it** (UI5-deshell — "not valuable for the bespoke till"). Same logic here: a kiosk station wants a minimal bespoke chrome, not back-office chrome + its peer-dep train (cdk, ng-bootstrap, apexcharts, echarts). Instead: **mirror @zoulte/shell design tokens in a local `tokens.css`** so it still *looks* like the Zoulte family. Auth is custom anyway (offline unlock). Revisit only if a back-office module is ever added. |
| D-3 | **Offline login = "offline unlock", capture-only.** | First login on a station must be online (JWT, roles, menu cached). Afterwards a locally stored PBKDF2 credential verifier allows unlock with no network → weighing + queueing only. Sync, verification signatures, and reports require a real online session. Required for ALCOA attributability of offline captures. |
| D-4 | **Copy the zoulte-pos-ui offline backbone, don't reinvent.** | Its Electron+SQLite stack, outbox sync engine, offline auth, and migration runner are built and test-proven on the exact same Angular version. See §2. |
| D-5 | **Weights are never typed.** Capture only from the serial stream, gated on a stable reading. | Foundation of the data-integrity story; enables the §211.101 automated-equipment argument. |
| D-6 | **Void, never delete.** All records immutable; corrections are voids with reason, audit-trailed. | Part 11 audit trail / ALCOA. |
| D-7 | **Verification is exception-based records review, online-only, re-auth signed.** | Per discussion: system controls (device-sourced value, stability gate, tolerance flag) do real-time verification; the second person reviews per-batch with flagged exceptions, signs with username+password re-auth, meaning recorded ("Records reviewed"). Verifier ≠ operator enforced. Witness-at-scale / photo evidence only if customer QA answers demand it (§6). |
| D-8 | **Sync never blocks on verification; verification never blocks sync.** | Independent signed events. Offline + absent verifier must not strand data. |
| D-9 | **Masters (users, products, categories) live in the backend's xaur-core tables — the app adds thin setup screens, not its own master store.** | xaur-core already ships user management (`sec`) and product/category masters (`core`) with APIs; duplicating them locally would fork master data. The app gets a minimal, permission-gated **Setup** area for scale-relevant CRUD only, plus a seeded **default category** (and default roles) so a new customer works out of the box. Masters are edited online-only and pulled down to SQLite for offline use. |
| D-10 | **This is an independent product.** A scale tenant may use neither OMS nor SFA; after one-time provisioning the tenant **self-manages everything in-app** (users, products, categories). Backend: **SFA today, OMS later — migration is planned but non-blocking.** | The hosting service is invisible infrastructure to the tenant. To keep the SFA→OMS move trivial: (a) the frontend depends only on xaur-core generic endpoints (`/sf/` auth, sec, menu) + the `ws_*` module — both identical wherever core is bundled — with the API base a single config value; (b) build the scale backend as a **self-contained module over xaur-core** (own package/Maven module, no SFA-domain imports), so relocating it into OMS is re-mounting the module, not a rewrite. |

## 2. Borrowed from zoulte-pos-ui (`I:\xaur\UI\zoulte-pos-ui`)

Read before building. What transfers, near-verbatim:

| POS asset | Location | Use here |
|---|---|---|
| **Pinned Electron stack** | `package.json` | Electron **41.7.0** + better-sqlite3 **12.10.0** (Electron 42's V8 ABI has no better-sqlite3 binary — hard-learned). Copy the `abi:node` / `abi:electron` prebuild scripts and the `--validate` boot mode (opens DB, applies schema, prints tables, exits — CI-friendly stack proof). |
| **Main/preload/IPC shape** | `projects/windows/electron/` | `main.js` (fullscreen prod / windowed dev via env dev-server URL, per-station DB in `userData`), `preload.js` (contextBridge, `contextIsolation:true`, `nodeIntegration:false` — renderer never touches Node), `ipc.js` (`db:query/run/transaction`). Rename bridge `posBridge` → `scaleBridge`. |
| **DataStore abstraction** | `core/src/lib/data/` | `DataStore` interface + `IpcDataStore` (renderer) + Node better-sqlite3 store (main). Lets services run identically in tests (in-memory), browser-dev (mock), and Electron (real DB). |
| **Migration runner** | `electron/db/migrations.js` | Forward-only, keyed on SQLite `user_version`, baseline = schema.sql. Copy as-is. |
| **Transactional outbox** | `core/src/lib/sync/outbox.ts` | Business row + outbox event in the **same transaction**; UPSERT on (entity_type, entity_uuid, operation) coalesces repeat events. Copy as-is; our entity types: `READING`, `VOID`, `BALANCE_CHECK`, `AUDIT`. |
| **SyncEngine** | `core/src/lib/sync/sync-engine.ts` | QUEUED → SENDING → SYNCED / RETRYING (exp backoff) / DEAD_LETTER; `recoverStuck()` on boot; idempotent on entity_uuid; `sync_status` mirror on entity tables for fast UI counts; background drain tick. Copy; swap `CloudClient` impl for our Xaur endpoints. |
| **ConnectivityService** | `core/src/lib/sync/connectivity.service.ts` | Signal over `navigator.onLine` + manual override. Copy as-is. |
| **Offline auth pattern** | `core/src/lib/auth/` | First-login-online-then-local-cache; `pin.ts` PBKDF2-SHA256 verifier (Web Crypto — works in renderer *and* Node) reused verbatim for **passwords**; 5-attempt lockout. Adapt `AuthService` to our JWT flow (cache verifier + role/menu snapshot on successful online login). |
| **Test harness** | vitest + `run-in-electron.js` | Unit specs (vitest) for pure logic + Electron integration tests that exercise renderer→IPC→main→SQLite for real. |
| **Docs discipline** | `docs/tracking/` | MASTER_RUNBOOK (append-only) / FINDINGS / BACKLOG / SESSION_HANDOFF. Adopt the same four files here. |

Not borrowed: POS domain code (billing/shift/pricing), the multi-project
workspace split (overkill here — we stay single-project + `electron/` folder),
the bespoke dark theme (we keep Zoulte blue/orange light tokens).

Note: POS BACKLOG already carries a "weighing-scale behind `PeripheralService.scaleRead()`"
design-intent item — our serial service is the reference implementation if that
ever activates. Keep `scale-serial.service.ts` cleanly separable.

## 3. Target architecture

```
zoulte-scale/
  electron/
    main.js          # window mgmt, per-station DB open, select-serial-port auto-grant
    preload.js       # contextBridge: scaleBridge.db.{query,run,transaction}, versions
    ipc.js           # db:* handlers
    db/
      schema.sql     # baseline (below)
      migrations.js  # user_version runner
      connection.js  # WAL + FK pragmas
      datastore.js   # NodeSqliteDataStore
  src/app/
    services/        # existing + interceptor, DataStore(Ipc/mock), sync, connectivity,
                     # offline-auth, audit
    weighing/        # redesigned station screen
    verification/    # NEW — review queue + re-auth signing
    balance-check/   # NEW — daily check wizard
    setup/           # NEW — ADMIN-only masters: products (simple create),
                     #       categories (default seeded), users (3 app roles)
    settings/        # NEW — scale/check-point config (PIN-protected)
    reports/         # existing + offline states + verified-by columns
  docs/              # this plan + tracking/ (runbook, findings, backlog, handoff)
```

**Serial:** keep Web Serial (works in Electron's Chromium). Main process handles
`select-serial-port`, auto-granting the pinned VID/PID from
`scale-device.config.ts` → no picker on the shop floor. Auto-reconnect on
disconnect. Later option: node-serialport behind the same service interface.

**Local schema (baseline, `ws_` prefix):**
`ws_reading` (reading_uuid PK, session fields: manufacturer/product/batch/mfg/expiry,
weight, unit, stable_flag, tolerance_flag, scale_id, operator, captured_at_client,
captured_at_server NULL, status ACTIVE/VOID, void_reason, verification fields NULL,
sync_status mirror) · `ws_balance_check` (+ per-point results JSON, pass/fail,
check-weight cert IDs) · `ws_audit` (event, entity_uuid, actor, at, old→new, append-only)
· `ws_sync_outbox` (as POS) · `ws_user_cache` (username, pwd_verifier PBKDF2,
role/menu snapshot, last_online_login) · `ws_config` (scale, tolerances, check points,
API base).

**Backend module naming (agreed 2026-07-28):** module `zoulte-scale-engine`,
root package `com.zoulte.erp.scale`, controllers `@RequestMapping("/scl/api")`
(catalog-engine pattern), table prefix `ws_` (as shipped), menu module code
**`WT-SCL`** (owner decision — replaces earlier `xaur-scale`; frontend updated,
seed script at docs/sql/menu-inserts-wt-scl.sql). Product display name:
"Zoulte WeighStation". App roles: WS_OPERATOR / WS_VERIFIER / WS_ADMIN.

**Server workstream (hosted in xaur-sfa today; built as a relocatable
xaur-core module for the later OMS move, per D-10) — parallel, per phase:** idempotent
ingest by `reading_uuid`; void endpoint; nominal weight ± tolerance on product
master; **simplified product-create endpoint** (≤5 fields, rest defaulted) +
per-tenant seed of default category and the three app roles
(OPERATOR/VERIFIER/ADMIN menu wiring); product/category delta-pull endpoints;
balance-check record ingest; verification record + signature manifest
(who/when/meaning) with verifier≠operator enforcement; audit ingest;
`verified_by`/`verified_at` + unsynced-caveat support in the two report endpoints.

## 4. Phases

Each phase ships something usable; runbook entry + tests per step.

**Phase 0 — Groundwork** *(S)*
HTTP interceptor (Bearer attach + 401 → session-expired → logout); delete
per-service token code. Vitest harness; unit-test the serial parser (all known
frame formats + stability inference). `tokens.css` mirroring @zoulte/shell
blue-light/orange-light. Adopt docs/tracking. **Send the customer-QA questions
(§6) now — Phases 5–7 consume the answers.**

**Phase 1 — Electron shell** *(S)*
`electron/` per §3; dev mode via `SCALE_DEV_SERVER_URL`; `--validate` mode;
`base-href ./` for `file://`; pinned Electron 41.7.0 + better-sqlite3 12.10.0 +
ABI scripts; electron-builder Windows installer. Exit: current app runs as a
desktop app, port auto-granted, DB stack validated.

**Phase 2 — Local-first data layer** *(L — the core)*
Schema + migrations; DataStore (Ipc + mock); capture path becomes
**local-write-first always** (reading + audit + outbox in one transaction);
SyncEngine drain tick against xaur-sfa; client + server timestamps
(clock-drift flag); header widgets (network / scale / N pending); sync-outbox
panel (pending, failed w/ error, retry, sync-now); readings list served from
local DB. Exit: pull the cable mid-shift, capture 50 readings, replug — all
sync exactly-once; kill the app mid-write — clean recovery (`recoverStuck`).

**Phase 3 — Offline unlock** *(S, security-sensitive)*
Per D-3: verifier cached via `pin.ts` PBKDF2 on successful online login;
offline unlock → capture-only mode (visible "OFFLINE — capture only" state);
5-attempt lockout; only previously-seen users; expired JWT never blocks capture.

**Phase 4 — Masters & onboarding (Setup area)** *(S–M, online-only, ADMIN role)*
Thin CRUD over existing xaur-core APIs — no new master store (D-9). Visible only
to the ADMIN role (menu-gated WRITE priv); operators/verifiers never see it.
- **Products — radically simple create.** One small form, ≤5 fields: product
  name, manufacturer, category (pre-selected = default category), optional
  nominal weight + tolerance. Everything else defaulted server-side. Also a
  **quick-add from the weighing session card** ("product not in list? + Add")
  so an admin can create mid-session without leaving the station flow.
- **Categories** — list + create; a **default category is auto-seeded** per
  tenant so category selection is skippable on day one.
- **Users — full self-service** over xaur-core `sec` APIs (the tenant has no
  other UI, per D-10): create, deactivate, **admin password reset**, role
  change. Role picker limited to the three app roles (OPERATOR / VERIFIER /
  ADMIN → menu privs READ / APPROVE / WRITE), wiring seeded per tenant.
- **Tenant provisioning (one-time, internal/ops — not a screen):** seed
  company/branch, first ADMIN user, the three roles + menu wiring, and the
  default category. Everything after that is tenant self-service.
- **Master pull-down** — SyncEngine `pullDomain('PRODUCT'|'CATEGORY')` (POS
  pattern) caches products/categories into SQLite so the Phase 5 session-card
  picker works offline. Masters remain create/edit online-only.
Exit: fresh tenant → admin logs in, creates 1 user + 1 product in under a
minute, default category untouched, product picker works offline afterwards.

**Phase 5 — Weighing screen redesign** *(M)*
Session card (product picked from cached master + batch entered once, sticky;
change = explicit action; admin quick-add hook per Phase 4) ·
hero weight readout + stability indicator · capture gated on stable+connected ·
tolerance check vs product-master nominal (out-of-range → acknowledge-or-void,
flag stored) · recent-captures strip (last ~10, session-scoped, sync badges,
running batch count) · void-last-with-reason · auto-reconnect banner states.
Full history/search stays OUT (reports own it).

**Phase 6 — Daily balance check** *(S–M)*
Config per scale (points, nominals, tolerances, cert IDs + expiry — from
customer SOP, never invented); guided wizard (stable zero → place weight N →
auto-capture → pass/fail); records through the same offline pipeline; capture
gating: no pass today → blocked with banner; FAIL → hard block, QA-role clear
only; cert-expiry warnings at 30 days.

**Phase 7 — Verification & signatures** *(M, online-only)*
`/verification` route, menu/permission-gated (APPROVE priv): per-batch queue,
exception-first display (tolerance/void flags on top), reject-line-with-reason,
verify → **re-auth prompt** → signature manifest (name, time, meaning "Records
reviewed"); verifier ≠ operator; status chips (Unverified/Verified/Rejected) on
weighing screen; verified-by columns + unsynced-count caveat in reports.

**Phase 8 — Hardening & ops** *(tail)*
Kiosk mode + auto-start; electron-updater; local DB backup/retention story;
settings screen finalised (PIN-protected); reports offline states; URS +
Part 11 mapping doc for the customer's validation package (CSV/GAMP support).

Effort shape: P0–P3 ≈ 35%, P4–P7 ≈ 55%, P8 tail. Suggested order strict:
0 → 1 → 2 → 3 → 4 (masters gate the session-card picker), then 5/6 can
interleave, 7 last (depends on QA answers + backend).

## 5. Regulatory mapping (what we claim)

- **§211.101** — second-person verification: exception-based review + device-
  sourced capture (automated-equipment argument). Exact clause per QA answer.
- **§211.68** — daily balance check records, calibration gating, cert tracking.
- **Part 11** — unique accounts (no shared kiosk login), re-auth e-signatures
  with meaning, immutable computer-generated audit trail (client+server),
  record retention/backup, validatable releases.
- **ALCOA+** — attributable (offline unlock), contemporaneous (capture-time
  stamps + clock-drift flag), original (device-sourced, never typed),
  accurate (stability gate + tolerance check).

Language rule: the app **supports** compliance; the customer's QA **validates**.

## 6. Open questions (blocking Phases 5–7 details)

1. Verification basis: §211.101 double-check as written, or automated-equipment
   path? Signature claims "records complete" or "right thing weighed"
   (→ witness mode / photo evidence)?
2. Are Part 11 electronic signatures required on these record types?
3. Balance-check SOP: points, check weights, tolerances, frequency
   (daily/per-use), repeatability test cadence?
4. Data retention period + backup expectations for the station DB?
5. Which scale models exactly (serial protocol sheets → command support: Z/T/S?).
6. ~~Which backend service?~~ **Resolved (D-10):** independent product; SFA
   hosts today, OMS is the target later — non-blocking. Backend `ws_*` code is
   built as a relocatable module over xaur-core from day one.

## 7. Next steps

1. Review this plan → freeze decisions D-1…D-8.
2. `/draft-stories` on Phases 0–2 → `docs/stories/`.
3. Fire §6 questions at customer QA in parallel.
