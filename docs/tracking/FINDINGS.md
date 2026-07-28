# FINDINGS — Zoulte Scale

Numbered, append-only. Status: 🔴 open · 🟡 monitored · 🟢 resolved.

| # | Status | Finding |
|---|--------|---------|
| F-001 | 🟡 | Test runner is Karma/Jasmine (project default), while zoulte-pos-ui uses vitest + an in-Electron integration harness. Kept Karma for now (already wired; assertion API ports both ways). Revisit if/when the Electron integration tests land in Phase 2 — those need the POS-style `run-in-electron` harness regardless of the unit runner. |
| F-002 | 🔴 | Backend `ws_*` endpoints (idempotent ingest by reading_uuid, void, product nominal/tolerance, delta-pull) do not exist yet in xaur-sfa — Phase 2 frontend sync can only be built against a stub/mock CloudClient until the backend workstream lands. Must be built as a relocatable xaur-core module (D-10). |
| F-003 | 🟢 | Login screen does not yet read the `?expired=1` query param set by `UtilService.logout({sessionExpired})`. RESOLVED in P3-offline-unlock: sessionExpired banner wired in login.component. |
| F-004 | 🟡 | No server idempotency on `api/weightscaleproduct` — a sync retry after a timed-out-but-committed POST duplicates the reading server-side. Mitigated by low retry frequency; properly fixed by BACKLOG backend item 1 (ingest dedupe on readingUuid). |
| F-005 | 🟡 | Products list (`/products`) rides the `vw_products` DB view with exact `division_code = :division` and unknown join requirements — a freshly created material can be invisible if the JWT has no division, the view demands price rows, or the view is absent from the SFA schema. Verify after first product create; if empty, the fix is likely a `ws_`-module list endpoint (company-scoped, table-backed) in the backend batch. |
