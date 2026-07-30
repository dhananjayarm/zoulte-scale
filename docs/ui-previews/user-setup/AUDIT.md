# Audit — User setup (`/setup/users`)

**Archetype:** Setup/policy form (create + edit) + List/grid.

## Findings — look & feel / consistency
- The table renders `Account Locked`, `Password Expired`, `First Login`, and `Active` as plain "Yes"/"No" text. These are exactly the states the app's `.chip` vocabulary exists for elsewhere (sync status, scale connection, verification) — and `Account Locked` / `Password Expired` in particular are the two an admin most needs to spot at a glance in a long list; burying them as plain text works against that.

## Findings — self-explanatory test
- The password minimum length (6 characters) only appears as a validation message *after* the field is touched and found invalid. Stating it upfront as helper text (before the first attempt) means the admin doesn't hit an avoidable round-trip.
- When editing a user, the Employee field disappears entirely (`@if (!editingUser())`). There's no substitute — no read-only label showing which employee this login belongs to. An admin working through a list of edits can lose track of which employee they're mid-edit on, especially since the User Name field is also disabled during edit.
- Empty state ("No users yet.") gives no next step.

## Findings — data model note (not a UI defect, flagging for awareness)
- `RoleOption.roleName` is populated from `row.roleCode` (see `user-card.component.ts` constructor) — the roles list has no human-readable name, only codes. Cosmetic role naming is a backend/data concern, not something this screen's markup can fix; noting it because it explains why the roles dropdown reads as raw codes.

## Materiality verdict
**Moderate.** Structure, validation, and the password show/hide + "leave blank to keep current password" pattern are already well done. The chip consistency gap and the vanishing-employee-context during edit are the two real, fixable findings. Preview generated.
