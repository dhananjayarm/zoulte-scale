v1 implemented on 2026-07-30.

Shipped:
- `employee-setup.component.html` — removed the incorrect "Not yet wired to the backend" claim from the header hint.
- `employee-card.component.html/.ts/.css` — added an "Editing {name}" banner (via new `editingEmployeeName` computed) shown while `editingCode()` is set; Active column now renders as a `.chip` (Active/Inactive) instead of plain Yes/No text; the Department modal gained explanatory copy (`.modal-intro`, `.modal-access-hint`) and the "+ Add More" button is now disabled (with a `.tooltip-note` hint) while the last access row is missing a Role Code or User Name, via a new `lastDeptAccessRowIncomplete` computed also used inside `addDeptAccessRow()`.

No form model, payload, or route changes. Build verified clean.
