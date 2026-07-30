# Audit — Weighing screen (`/weightscale`)

**Archetype:** instrument console / transactional capture screen (session setup → live readout → capture → recent log). Sections 1 (identity/lifecycle) mostly don't apply; sections 2–9 do.

## Current state (baseline)
Already a well-crafted screen — deliberate hint text, disabled-state explanations (`captureHint`), and token-consistent styling throughout. This audit found polish opportunities, not broken fundamentals.

## Findings

**Structural / interaction**
- No keyboard shortcut for Capture. This is a repetitive shop-floor action (weigh → capture → weigh → capture); an operator's hand is often on the keyboard, not reaching for the touchscreen button every time. Space-to-capture (when focus isn't in a text field) is a natural fit — proposed, flagged structural.
- No running total weight for the active session/batch — only a capture *count*. For a pharma batch, "how much have I dispensed so far vs typical batch size" is a more useful running number than count alone. Proposed as an addition to the session card.
- Void has no consequence microcopy — the reason field is required, but nothing states this is permanent/irreversible before the operator commits.

**Copy**
- `Batch {{ batchNumber }}` chip uses `chip--pending` (grey/neutral) styling — pending usually means "awaiting something." A batch identifier isn't a status; consider a neutral/plain badge treatment distinct from the status-chip vocabulary used elsewhere (synced/stable/settling).

**Accessibility**
- Void-reason `<input>` has no `aria-label` (relies on placeholder only — placeholders are not accessible names).
- The live readout value changes (weight ticking, stability changing) have no `aria-live` region, so a screen-reader user gets no feedback that a reading arrived or stabilized.

**Look & feel**
- No hardcoded colors found outside tokens — clean.

## Token extension proposals
None required — existing tokens (`--accent`, `--success`, `--warn`, `--danger`, `--font-mono`, etc.) cover the preview's needs.

## Materiality verdict
**Moderate.** Structure and states are sound; the opportunity is instrument-specific polish (keyboard capture, running batch weight, void consequence copy, a11y live region) rather than a rebuild. Preview generated.
