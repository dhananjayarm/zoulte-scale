# Audit — Category setup (`/setup/category`)

**Archetype:** Setup/policy form (create) + List/grid (existing categories), single-field master-data screen.

## Findings

**Copy & self-explanatory test**
- The "unit … · type …" defaults line (`@if (form.controls.categoryName.value.trim())`) only appears once the admin has started typing a name. Since it explains what will happen on save, gating it on "has the admin typed something" instead of always showing it (or showing on focus) reads as a glitch — the hint disappears/reappears as the admin edits the name. It should be always visible while the create form is in view.
- "unit GRAM · type FG" is raw code jargon. A first-time admin has no way to know what `FG` means or why a category has a unit/inventory type at all. Needs a plain-language line, e.g. "New products in this category default to gram-based dispensing and Finished Goods inventory — you can change this per product." This is the self-explanatory-test gap (checklist §8).
- Empty state "No categories yet." gives no next step. Checklist §8 wants an instructive empty state, e.g. "No categories yet — add your first one above, like Tablets or Syrups."

**Consistency**
- The existing-categories list renders as a bare `<ul>` (name only), while the sibling Product screen renders its list as a `<table>` with a Category column. Two master-data screens in the same Setup section use two different list idioms for what is structurally the same kind of data — worth converging on one pattern (table) for scan-ability and future column growth (e.g. adding a code or product-count column later).
- No search/filter on the category list. Low risk today (short list) but flagged since Product/Employee/User all face the same gap — worth solving once, consistently, if lists are expected to grow.

**Data already modeled but not surfaced**
- `CategoryRow` (in `material-api.service.ts`) already carries `defaultUom` and `invTypeCode` per category — the backend supports a category having its own defaults. The screen never shows or lets the admin set these per-category; every category silently gets the same platform-wide default (`facade.defaultUom()`/`facade.defaultInvType()`). Worth surfacing as real columns (data already exists, no invention) even before deciding whether they become editable.

**Structural (open question, not assumed)**
- No edit/delete for a saved category. May be intentional (categories are foundational and rarely renamed once products reference them) — flagging as an open product question rather than a defect, since undoing a typo currently requires... nothing (no path at all). At minimum, a rename affordance seems low-risk to add.

## Materiality verdict
**Moderate.** No broken functionality, but the defaults-line reveal condition, jargon labels, and inconsistent list styling are real, fixable self-explanatory-test and consistency gaps. Preview generated.
