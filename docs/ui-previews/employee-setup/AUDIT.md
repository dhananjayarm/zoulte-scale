# Audit — Employee setup (`/setup/employee`)

**Archetype:** Setup/policy form (create + edit) + List/grid, with an embedded quick-create modal (Department).

## Findings — broken / misleading (highest priority)
- `employee-setup.component.html` header text reads: *"Operators & verifiers master. **Not yet wired to the backend — data here is local to this session.**"* This is false: `employee-card.component.ts` calls real endpoints (`api/scale/employees`, `api/scale/employee`, `api/cr/employee/getMgs`, `api/cr/depts/active`) via `HttpGetService`/`HttpPostService`/`HttpPutService`. Telling an admin their data won't persist when it actually does is a data-safety-relevant miscommunication — likely stale copy left over from an earlier prototype stage. Should be corrected regardless of any rework decision below.

## Findings — self-explanatory test
- The "Add Department" modal's "Department Access" section (Role Code + User Name rows) has zero explanatory copy. A first-time admin sees a required, dynamically-growing list of role/user pairs with no statement of what it's for (who gets access to records tagged with this department) or why it's needed at department-creation time.
- `createDepartment()` requires at least one access row (`deptAccessRows().length === 0` blocks save), but nothing in the UI states this before the admin tries to save and hits a generic error banner.
- `addDeptAccessRow()` silently does nothing if the last row's Role Code is still empty — no disabled state, no tooltip, no message. A first-time admin clicking "+ Add More" repeatedly would reasonably conclude the button is broken.
- No consequence copy on the "Active" checkbox (what happens to an employee marked inactive — can they still be picked as a supervisor? Log in?).

## Findings — look & feel / consistency
- Active column renders as plain "Yes"/"No" text, not the `.chip` treatment used everywhere else in the app for status (sync state, scale state, verification state). Employee active/inactive is exactly the kind of state the chip vocabulary exists for.
- Edit mode has no visual marker beyond the submit button relabeling to "Update employee" and a Cancel button appearing — easy to miss, especially since the form auto-scrolls into view (a fast admin might not notice the button text changed).
- No search/filter on the employee table.

## Materiality verdict
**Significant** — the incorrect "not wired to the backend" copy is a real, user-facing data-trust problem independent of any visual rework, and the Department modal's self-explanatory gaps are genuine (not merely cosmetic). Preview generated.
