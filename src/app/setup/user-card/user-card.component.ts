import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { HttpGetService } from '../../services/http-get.service';
import { HttpPostService } from '../../services/http-post.service';
import { HttpPutService } from '../../services/http-put.service';

export interface EmployeeOption {
  employeeCode: string;
  employeeName: string;
}

interface EmployeeTypeRow {
  code: string;
  name: string;
  userName: string | null;
}

export interface RoleOption {
  roleCode: string;
  roleName: string;
}

interface SecRoleRow {
  roleId: number;
  roleCode: string;
  application: string;
  isactive: boolean;
}

interface Envelope<T> {
  status: { message: string; userMessage?: string };
  response: T;
}

export interface UserRow {
  id: number;
  userName: string;
  userCode: string;
  accountLocked: boolean;
  passwordExpired: boolean;
  firstLogin: boolean;
  isActive: boolean;
  roles: string[];
  /** The untouched row from api/scale/users — spread back into the update payload so fields we don't track aren't lost. */
  raw: UserListRow;
}

interface UserListRow {
  id: number;
  userName: string;
  userCode: string;
  accountLocked: boolean;
  passwordExpired: boolean;
  firstLogin: boolean;
  isactive: boolean;
  roles: string | null;
  [key: string]: unknown;
}

/**
 * `api/scale/users` doesn't always send these as real JSON booleans (string
 * "false"/"0"/"N" have all been observed) — a bare truthy check on a non-empty
 * string is always true, which silently forced every locked/expired/active
 * chip to its "Yes"/positive color regardless of the actual value. Normalize
 * once here so the table only ever sees real booleans.
 */
function toBool(value: unknown): boolean {
  if (typeof value === 'string') {
    return ['true', '1', 'y', 'yes'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return password && confirmPassword && password !== confirmPassword ? { mismatch: true } : null;
}

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.css',
})
export class UserCardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly httpGet = inject(HttpGetService);
  private readonly httpPost = inject(HttpPostService);
  private readonly httpPut = inject(HttpPutService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _employees = signal<EmployeeOption[]>([]);
  readonly employees = this._employees.asReadonly();

  private readonly _roles = signal<RoleOption[]>([]);
  readonly roles = this._roles.asReadonly();

  private readonly _users = signal<UserRow[]>([]);
  readonly users = this._users.asReadonly();

  readonly searchTerm = signal('');
  readonly filteredUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this._users();
    }
    return this._users().filter((user) => user.userName.toLowerCase().includes(term));
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize())));
  readonly pagedUsers = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredUsers().slice(start, start + size);
  });

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.currentPage.set(1);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  /** Page numbers to render, with `null` standing in for a "…" gap. Always shows first/last and a window around the current page. */
  readonly pageNumbers = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const current = Math.min(this.currentPage(), total);
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | null)[] = [1];
    if (current > 3) {
      pages.push(null);
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (current < total - 2) {
      pages.push(null);
    }
    pages.push(total);
    return pages;
  });

  /** User being edited, or null when creating a new one. */
  readonly editingUser = signal<UserRow | null>(null);

  /** Employee name for the read-only display while editing (the picker is hidden then). */
  readonly editingEmployeeName = computed(() => {
    const user = this.editingUser();
    if (!user) {
      return null;
    }
    return this._employees().find((emp) => emp.employeeCode === user.userCode)?.employeeName ?? user.userCode;
  });

  readonly rolesMenuOpen = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);
  private savedNameTimeout?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.nonNullable.group(
    {
      employeeCode: ['', Validators.required],
      userName: ['', Validators.required],
      roles: this.fb.nonNullable.control<string[]>([], Validators.required),
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  constructor() {
    this.httpGet
      .get<Envelope<EmployeeTypeRow[]>>('api/sec/secUser/userType?userType=EMPLOYEE&module=WT-SCL')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            employeeCode: row.code,
            employeeName: row.name,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._employees.set(rows));

    this.httpGet
      .get<Envelope<SecRoleRow[]>>('api/sec/secroles?app=zoulte-scale')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            roleCode: row.roleCode,
            roleName: row.roleCode,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._roles.set(rows));

    this.loadUsers();
  }

  private loadUsers(): void {
    this.httpGet
      .getSfa<Envelope<UserListRow[]>>('api/scale/users')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            id: row.id,
            userName: row.userName,
            userCode: row.userCode,
            accountLocked: toBool(row.accountLocked),
            passwordExpired: toBool(row.passwordExpired),
            firstLogin: toBool(row.firstLogin),
            isActive: toBool(row.isactive),
            roles: (row.roles ?? '')
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean),
            raw: row,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._users.set(rows));
  }

  editUser(user: UserRow): void {
    this.editingUser.set(user);
    this.savedName.set(null);
    this.error.set(null);
    this.setPasswordRequired(false);
    this.form.reset({
      employeeCode: user.userCode,
      userName: user.userName,
      roles: [...user.roles],
      password: '',
      confirmPassword: '',
    });
    this.form.controls.userName.disable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingUser.set(null);
    this.setPasswordRequired(true);
    this.form.reset({ employeeCode: '', userName: '', roles: [], password: '', confirmPassword: '' });
    this.form.controls.userName.enable();
  }

  private setPasswordRequired(required: boolean): void {
    this.form.controls.password.setValidators(required ? [Validators.required, Validators.minLength(6)] : []);
    this.form.controls.confirmPassword.setValidators(required ? [Validators.required] : []);
    this.form.controls.password.updateValueAndValidity();
    this.form.controls.confirmPassword.updateValueAndValidity();
  }

  toggleRolesMenu(): void {
    this.rolesMenuOpen.update((open) => !open);
  }

  closeRolesMenu(): void {
    this.rolesMenuOpen.set(false);
  }

  isRoleSelected(roleCode: string): boolean {
    return this.form.controls.roles.value.includes(roleCode);
  }

  toggleRole(roleCode: string): void {
    const current = this.form.controls.roles.value;
    const next = current.includes(roleCode) ? current.filter((code) => code !== roleCode) : [...current, roleCode];
    this.form.controls.roles.setValue(next);
    this.form.controls.roles.markAsTouched();
  }

  rolesLabel(): string {
    const selected = this.form.controls.roles.value;
    if (!selected.length) {
      return 'Select Roles';
    }
    const names = new Map(this._roles().map((r) => [r.roleCode, r.roleName]));
    return selected.map((code) => names.get(code) ?? code).join(', ');
  }

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const userName = raw.userName.trim();
    const editing = this.editingUser();

    const passwordChanged = editing ? raw.password.trim().length > 0 : false;
    if (editing && passwordChanged && raw.password !== raw.confirmPassword) {
      this.form.controls.confirmPassword.markAsTouched();
      this.error.set('Passwords do not match.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.savedName.set(null);
    try {
      if (editing) {
        // Start from the untouched row api/scale/users returned (id, userType,
        // branchCode, companyCode, firstLogin, createdby, ... ) so fields this
        // form doesn't track aren't dropped on update — then override what changed.
        // `roles` is excluded: the API's comma-string field, not the roles array below.
        const { roles: _rolesString, ...userBase } = editing.raw;
        const user: Record<string, unknown> = {
          ...userBase,
          userName,
          userCode: raw.employeeCode,
        };
        if (passwordChanged) {
          user['password'] = raw.password;
        }
        await firstValueFrom(
          this.httpPut.put(`api/sec/user/role?chgd=${passwordChanged ? 'Y' : 'N'}`, {
            user,
            roles: raw.roles.map((roleCode) => ({ roleCode, isactive: true })),
          }),
        );
      } else {
        await firstValueFrom(
          this.httpPost.postSfa('api/scale/user', {
            user: {
              userName,
              password: raw.password,
              userCode: raw.employeeCode,
              isactive: true,
              accountLocked: false,
              multiBranch: false,
              passwordExpired: false,
            },
            roles: raw.roles.map((roleCode) => ({ roleCode, isactive: true })),
          }),
        );
      }

      this.loadUsers();
      this.editingUser.set(null);
      this.setPasswordRequired(true);
      this.savedName.set(userName);
      this.form.reset({ employeeCode: '', userName: '', roles: [], password: '', confirmPassword: '' });
      this.form.controls.userName.enable();
      clearTimeout(this.savedNameTimeout);
      this.savedNameTimeout = setTimeout(() => this.savedName.set(null), 4000);
    } catch (err) {
      this.error.set(describeError(err, editing));
    } finally {
      this.saving.set(false);
    }
  }
}

function describeError(err: unknown, editing: UserRow | null): string {
  const status = (err as { error?: { status?: { userMessage?: string; message?: string } } })?.error?.status;
  const fallback = editing ? 'Could not update the user.' : 'Could not create the user.';
  return status?.userMessage ?? status?.message ?? fallback;
}
