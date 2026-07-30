v4 implemented on 2026-07-30.

Scope actually shipped: Recent captures converted from a `<ul>` list to a `<table>` with header row (Weight, Product / Batch, Time, Status). The Void action was removed from this screen per explicit confirmation — `beginVoid`/`cancelVoid`/`confirmVoid`, `voidingUuid`, and `voidReason` were deleted from `weighing.component.ts`, along with their template and CSS. `ReadingStore.voidReading`/`supportsVoid` were left untouched in the shared service (out of scope for this screen-only change).

Not implemented (deferred, still only in v1/v2 previews): keyboard Space-to-capture, batch running-total stat tile. Revisit if wanted later.
