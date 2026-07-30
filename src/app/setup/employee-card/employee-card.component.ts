import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { HttpGetService } from '../../services/http-get.service';
import { HttpPostService } from '../../services/http-post.service';
import { HttpPutService } from '../../services/http-put.service';

/** Role Code choices for department access rows — same fixed set xaur-hr-ui uses. */
const DEPT_ROLE_TYPES = ['Owners', 'Managers', 'Users'];

interface DeptAccessRow {
  roleCode: string | null;
  userName: string | null;
}

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  employeeName: string;
  email: string;
  contactNo: string;
  supervisorId: string | null;
  deptCode: string | null;
  isActive: boolean;
}

export interface SupervisorOption {
  employeeCode: string;
  employeeName: string;
}

export interface DeptOption {
  deptCode: string;
  deptName: string;
}

interface Envelope<T> {
  status: { message: string; userMessage?: string };
  response: T;
}

interface EmployeeListItem {
  employee: {
    id: number;
    employeeCode: string;
    employeeName: string;
    supervisorCode: string | null;
    deptCode: string | null;
    isactive: boolean;
    [key: string]: unknown;
  };
  contactNo: number | string;
  email: string;
}

interface DeptRow {
  deptCode: string;
  deptName: string;
}

@Component({
  selector: 'app-employee-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-card.component.html',
  styleUrl: './employee-card.component.css',
})
export class EmployeeCardComponent {
  private readonly fb = inject(FormBuilder);
  private readonly httpGet = inject(HttpGetService);
  private readonly httpPost = inject(HttpPostService);
  private readonly httpPut = inject(HttpPutService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _employees = signal<EmployeeRow[]>([]);
  readonly employees = this._employees.asReadonly();

  readonly searchTerm = signal('');
  readonly filteredEmployees = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this._employees();
    }
    return this._employees().filter(
      (emp) =>
        emp.employeeName.toLowerCase().includes(term) ||
        emp.email.toLowerCase().includes(term) ||
        emp.contactNo.includes(term),
    );
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredEmployees().length / this.pageSize())));
  readonly pagedEmployees = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredEmployees().slice(start, start + size);
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

  private readonly _supervisors = signal<SupervisorOption[]>([]);
  readonly supervisors = this._supervisors.asReadonly();

  private readonly _depts = signal<DeptOption[]>([]);
  readonly depts = this._depts.asReadonly();

  // Quick-add "Department" modal (mirrors xaur-hr-ui's create-department flow).
  readonly roleTypes = DEPT_ROLE_TYPES;
  readonly showDeptModal = signal(false);
  readonly deptSaving = signal(false);
  readonly deptError = signal<string | null>(null);
  readonly deptAccessRows = signal<DeptAccessRow[]>([]);
  private readonly _deptUserNames = signal<string[]>([]);
  readonly deptUserNames = this._deptUserNames.asReadonly();

  readonly deptForm = this.fb.nonNullable.group({
    deptCode: ['', Validators.required],
    deptName: ['', Validators.required],
    isActive: [true],
  });

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);
  private savedNameTimeout?: ReturnType<typeof setTimeout>;

  /** employeeCode of the row being edited, or null when adding a new one. */
  readonly editingCode = signal<string | null>(null);

  /** Name of the employee currently being edited, for the "Editing …" banner. */
  readonly editingEmployeeName = computed(() => {
    const code = this.editingCode();
    if (!code) {
      return null;
    }
    return this._employees().find((emp) => emp.employeeCode === code)?.employeeName ?? null;
  });

  /** True once a Department-access row exists but its Role Code or User Name is still blank. */
  readonly lastDeptAccessRowIncomplete = computed(() => {
    const rows = this.deptAccessRows();
    const last = rows[rows.length - 1];
    return !!last && (!last.roleCode || !last.userName);
  });

  readonly form = this.fb.nonNullable.group({
    employeeName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    contactNo: ['', [Validators.required, Validators.pattern(/^[0-9]{7,15}$/)]],
    supervisorId: ['', Validators.required],
    deptCode: ['', Validators.required],
    isActive: [true],
  });

  constructor() {
    this.httpGet
      .get<Envelope<SupervisorOption[]>>('api/cr/employee/getMgs')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            employeeCode: row.employeeCode,
            employeeName: row.employeeName,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._supervisors.set(rows));

    this.httpGet
      .get<Envelope<DeptRow[]>>('api/cr/depts/active')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            deptCode: row.deptCode,
            deptName: row.deptName,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._depts.set(rows));

    this.httpGet
      .get<Envelope<string[]>>('api/sec/secUser/userName?userType=Employee')
      .pipe(
        map((env) => env.response ?? []),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((names) => this._deptUserNames.set(names));

    this.loadEmployees();
  }

  private loadEmployees(): void {
    this.httpGet
      .getSfa<Envelope<EmployeeListItem[]>>('api/scale/employees')
      .pipe(
        map((env) =>
          (env.response ?? []).map((row) => ({
            id: String(row.employee.id),
            employeeCode: row.employee.employeeCode,
            employeeName: row.employee.employeeName,
            email: row.email ?? '',
            contactNo: String(row.contactNo ?? ''),
            supervisorId: row.employee.supervisorCode || null,
            deptCode: row.employee.deptCode || null,
            isActive: row.employee.isactive,
          })),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => this._employees.set(rows));
  }

  readonly supervisorName = computed(() => {
    const names = new Map<string, string>();
    for (const sup of this._supervisors()) {
      names.set(sup.employeeCode, sup.employeeName);
    }
    return (code: string | null) => (code ? names.get(code) ?? '—' : '—');
  });

  readonly deptName = computed(() => {
    const names = new Map<string, string>();
    for (const dept of this._depts()) {
      names.set(dept.deptCode, dept.deptName);
    }
    return (code: string | null) => (code ? names.get(code) ?? '—' : '—');
  });

  startEdit(emp: EmployeeRow): void {
    this.editingCode.set(emp.employeeCode);
    this.savedName.set(null);
    this.error.set(null);
    this.form.reset({
      employeeName: emp.employeeName,
      email: emp.email,
      contactNo: emp.contactNo,
      supervisorId: emp.supervisorId ?? '',
      deptCode: emp.deptCode ?? '',
      isActive: emp.isActive,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingCode.set(null);
    this.form.reset({ employeeName: '', email: '', contactNo: '', supervisorId: '', deptCode: '', isActive: true });
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
    const name = raw.employeeName.trim();
    const supervisorLabel = this.supervisorName()(raw.supervisorId || null);
    const editingCode = this.editingCode();

    const employee: Record<string, unknown> = {
      employeeName: name,
      supervisorCode: raw.supervisorId,
      supervisorName: supervisorLabel === '—' ? '' : supervisorLabel,
      roleCode: 'OPERATOR',
      spanOfControl: 'none',
      isFieldEmployee: false,
      baseTerritoryCode: '',
      regionCode: '',
      isactive: raw.isActive,
    };
    if (editingCode) {
      employee['employeeCode'] = editingCode;
    }
    const payload = {
      employee,
      contactNo: raw.contactNo.trim(),
      email: raw.email.trim(),      
      deptCode: raw.deptCode,
    };

    this.saving.set(true);
    this.error.set(null);
    this.savedName.set(null);
    try {
      if (editingCode) {
        await firstValueFrom(this.httpPut.putSfa('api/scale/employee', payload));
      } else {
        await firstValueFrom(this.httpPost.postSfa('api/scale/employee', payload));
      }

      this.loadEmployees();

      this.editingCode.set(null);
      this.savedName.set(name);
      this.form.reset({ employeeName: '', email: '', contactNo: '', supervisorId: '', deptCode: '', isActive: true });
      clearTimeout(this.savedNameTimeout);
      this.savedNameTimeout = setTimeout(() => this.savedName.set(null), 4000);
    } catch (err) {
      this.error.set(describeError(err, editingCode ? 'Could not update the employee.' : 'Could not save the employee.'));
    } finally {
      this.saving.set(false);
    }
  }

  openDeptModal(): void {
    this.deptForm.reset({ deptCode: '', deptName: '', isActive: true });
    this.deptAccessRows.set([]);
    this.deptError.set(null);
    this.showDeptModal.set(true);
  }

  closeDeptModal(): void {
    this.showDeptModal.set(false);
  }

  addDeptAccessRow(): void {
    if (this.deptForm.controls.deptCode.invalid) {
      this.deptForm.controls.deptCode.markAsTouched();
      return;
    }
    if (this.lastDeptAccessRowIncomplete()) {
      return;
    }
    this.deptAccessRows.update((r) => [...r, { roleCode: null, userName: null }]);
  }

  removeDeptAccessRow(index: number): void {
    this.deptAccessRows.update((rows) => rows.filter((_, i) => i !== index));
  }

  updateDeptAccessRow(index: number, patch: Partial<DeptAccessRow>): void {
    this.deptAccessRows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async createDepartment(): Promise<void> {
    if (this.deptSaving()) {
      return;
    }
    if (this.deptForm.invalid || this.deptAccessRows().length === 0) {
      this.deptForm.markAllAsTouched();
      return;
    }
    const rows = this.deptAccessRows();
    if (rows.some((row) => !row.roleCode || !row.userName)) {
      this.deptError.set('Each department access row needs a Role Code and User Name.');
      return;
    }
    const raw = this.deptForm.getRawValue();
    const deptCode = raw.deptCode.trim();

    this.deptSaving.set(true);
    this.deptError.set(null);
    try {
      await firstValueFrom(
        this.httpPost.post('api/cr/deptwithaccess', {
          deptDto: {
            deptCode,
            deptName: raw.deptName.trim(),
            isactive: raw.isActive,
          },
          accessDTOs: rows.map((row) => ({
            id: null,
            deptCode: null,
            userType: 'Employee',
            deptRoleCode: row.roleCode,
            userName: row.userName,
            buCode: null,
            tenantCode: null,
            createdby: null,
            createddate: null,
            lastmodifiedby: null,
            lastmodifieddate: null,
            status: null,
          })),
        }),
      );

      this.httpGet
        .get<Envelope<DeptRow[]>>('api/cr/depts/active')
        .pipe(
          map((env) =>
            (env.response ?? []).map((row) => ({
              deptCode: row.deptCode,
              deptName: row.deptName,
            })),
          ),
        )
        .subscribe((depts) => {
          this._depts.set(depts);
          this.form.controls.deptCode.setValue(deptCode);
        });

      this.showDeptModal.set(false);
    } catch (err) {
      this.deptError.set(describeError(err, 'Could not create the department.'));
    } finally {
      this.deptSaving.set(false);
    }
  }
}

function describeError(err: unknown, fallback: string): string {
  const status = (err as { error?: { status?: { userMessage?: string; message?: string } } })?.error?.status;
  return status?.userMessage ?? status?.message ?? fallback;
}
