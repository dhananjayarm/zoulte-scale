# Audit — Product setup (`/setup/product`)

**Archetype:** Setup/policy form (create) + List/grid (existing products).

## Findings — broken (fix regardless of any rework)
- `product-card.component.ts` line 56, inside `save()`: a bare **`debugger`** statement left in the code. With DevTools open (common during support/demo sessions), every product save pauses script execution — the Save button will appear to hang. This isn't a UX/design finding, it's a shipped bug; flagging it because it directly breaks the screen this audit is reviewing. Recommend removing it independent of whether any preview below is approved.

## Findings — self-explanatory test
- Same jargon gap as Category: the "unit … · type …" line under the form shows raw codes (`GRAM`, `FG`) with only a bare "change" link — no explanation of what changing them affects. First-time admin has no way to know these are dispensing defaults for this product.
- The category warning banner ("Create a category first…") is good — clear, actionable, already meets the bar.

## Findings — consistency / structure
- No search/filter on the product table; likely to matter sooner here than on Categories, since product masters tend to grow into the hundreds for a pharma distributor.
- No edit affordance for an existing product (same open question as Category — flagging, not assuming it's missing by oversight).
- The Details toggle ("change") reveals Unit + Inventory type selects with no helper text on either — a first-time admin changing them has no signal of consequence (e.g., does changing the unit after products already exist retroactively affect anything? Likely not, since this only applies at creation, but the screen doesn't say so).

## Materiality verdict
**Significant** — primarily because of the `debugger` statement (a real functional defect), plus the same jargon/list gaps as Category. Preview generated for the UX gaps; the `debugger` line should be removed as a one-line fix regardless of preview approval.
