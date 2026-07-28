# SESSION HANDOFF — Zoulte Scale

Volatile state for the next session. Overwritten each save.

## Current state (2026-07-27, end of implementation session 1)
Phases 0, 1, 2, 3 and 5 of docs/IMPLEMENTATION_PLAN.md are BUILT and verified
(26/26 Karma unit tests, 1 in-Electron DB integration test, `--validate` green,
dev + desktop builds clean). Phase 4 (masters/setup screens) deliberately
skipped for now — backend endpoints don't exist (FINDINGS F-002); the weighing
session card uses free-text product fields until then.

Nothing is committed — working tree only (owner commits explicitly).

## What works right now
- `npm start` → browser app (original direct-HTTP behaviour, RemoteReadingStore).
- `npm run electron:dev` (with `npm start` running) or `npm run electron:start`
  → desktop station: SQLite offline-first capture (reading+audit+outbox one
  txn), background drain (10s tick + online trigger), header status chips +
  outbox panel, offline unlock (after one online login), capture-only guard,
  redesigned weighing screen (session card / hero readout / stability-gated
  capture / recent strip / void-with-reason).
- `npm run electron:validate` and `npm run test:db` — Electron stack checks.

## Verify manually next (needs hardware/backend I didn't have)
- Real scale: connect/auto-grant (set electron/station-config.js VID/PID),
  stability inference on the Ultima, capture flow end-to-end.
- Real backend: drain marks rows SYNCED; DEAD_LETTER on a 4xx; offline→online
  replay. NOTE: server has no idempotency yet (F-002) — a retry after a
  timeout-but-committed POST can duplicate a reading server-side.
- Offline unlock: online login → kill network → relogin offline → capture →
  restore network → auto-sync.

## Next concrete actions (in order)
1. Backend workstream (xaur-sfa, relocatable module per D-10): idempotent
   ingest by readingUuid, VOID endpoint, then flip VOID into
   SUPPORTED_ENTITY_TYPES in cloud-client.ts.
2. Phase 4 masters (needs backend): products/categories/users setup area +
   session-card picker + pullDomain PRODUCT/CATEGORY.
3. Phase 6 balance check (frontend can start anytime; SOP numbers from QA §6.3).
4. Phase 7 verification (needs QA answers §6.1/6.2 + backend).
5. Phase 8 hardening: electron-builder installer, kiosk, DB backup.
