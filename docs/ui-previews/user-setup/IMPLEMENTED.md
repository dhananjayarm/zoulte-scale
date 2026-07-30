v1 implemented on 2026-07-30.

Shipped:
- `user-card.component.html/.ts/.css` — Account Locked, Password Expired, First Login, and Active columns now render as `.chip`s (danger/warn/pending/success as appropriate) instead of plain Yes/No text; the password field shows "At least 6 characters." helper text upfront instead of only after a failed attempt; editing a user now shows a read-only "Employee: {name}" field (new `editingEmployeeName` computed) in place of hiding the picker entirely.

No form model, payload, or route changes — the read-only employee display doesn't bind `formControlName`, so `employeeCode`'s value and the save payload are unaffected. Build verified clean.
