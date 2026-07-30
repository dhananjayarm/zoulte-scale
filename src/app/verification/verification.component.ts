import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import Swal from 'sweetalert2';
import { HttpGetService } from '../services/http-get.service';
import { HttpPutService } from '../services/http-put.service';
import { MaterialApiService, type ProductRow } from '../services/masters/material-api.service';
import { toUnitSymbol } from '../services/data/units';

type VerificationStatus = 'APPROVED' | 'REJECTED';

/**
 * yyyy-MM-dd from local date parts. The operator's calendar day is the one that counts —
 * the server can't work it out for them, so the browser resolves every window here.
 */
function toIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compares by calendar day only — matches the yyyy-MM-dd a native date input gives us.
 * Uses local date parts (not a raw string slice) so it agrees with the `date` pipe used
 * in the table, which renders in the browser's local timezone.
 */
function toDateOnly(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return '';
  }
  return toIsoDay(date);
}

/** Which slice of records to ask the server for. */
export type DateWindow = 'ANY' | 'TODAY' | 'LAST_7' | 'LAST_30' | 'CUSTOM';

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'NEW', label: 'New only' },
  { value: 'ALL', label: 'All statuses' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const DATE_WINDOW_OPTIONS: ReadonlyArray<{ value: DateWindow; label: string }> = [
  { value: 'ANY', label: 'All dates' },
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7', label: 'Last 7 days' },
  { value: 'LAST_30', label: 'Last 30 days' },
  { value: 'CUSTOM', label: 'Custom range' },
];

/** How far back each preset reaches, counting today as day one. */
const WINDOW_DAYS: Partial<Record<DateWindow, number>> = { TODAY: 1, LAST_7: 7, LAST_30: 30 };

/** Columns the verification table can be sorted by — Action is not one of them. */
type VerificationSortKey =
  | 'date'
  | 'time'
  | 'product'
  | 'weight'
  | 'batch'
  | 'mfgDate'
  | 'expiryDate'
  | 'manufacturer'
  | 'status';

const VERIFICATION_COLUMNS: ReadonlyArray<{ key: VerificationSortKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'product', label: 'Product' },
  { key: 'weight', label: 'Weight' },
  { key: 'batch', label: 'Batch No' },
  { key: 'mfgDate', label: 'Mfd Date' },
  { key: 'expiryDate', label: 'Expiry Date' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'status', label: 'Status' },
];

/** Columns whose useful end is the high one — newest capture, heaviest weight, latest date. */
const DESCENDING_FIRST = new Set<VerificationSortKey>(['date', 'time', 'weight', 'mfgDate', 'expiryDate']);

function compareItems(a: VerificationItem, b: VerificationItem, key: VerificationSortKey): number {
  switch (key) {
    // Date and Time render the same instant, so each sorts by what it shows: Date by
    // the full timestamp, Time by clock time — which groups an early shift across days.
    case 'date':
      return toTimestamp(a.createddate) - toTimestamp(b.createddate);
    case 'time':
      return toSecondsOfDay(a.createddate) - toSecondsOfDay(b.createddate);
    case 'product':
      return a.productName.localeCompare(b.productName);
    case 'weight':
      return a.netWeight - b.netWeight;
    case 'batch':
      return a.batchNo.localeCompare(b.batchNo);
    case 'mfgDate':
      return toTimestamp(a.manufacturingDate) - toTimestamp(b.manufacturingDate);
    case 'expiryDate':
      return toTimestamp(a.expiryDate) - toTimestamp(b.expiryDate);
    case 'manufacturer':
      return a.manufacturerName.localeCompare(b.manufacturerName);
    case 'status':
      return a.status.localeCompare(b.status);
  }
}

/**
 * Unparseable dates sort oldest, so a bad row never leads the list. Accepts a number
 * because Jackson may serialise the DTO's java.util.Date fields as epoch millis.
 */
function toTimestamp(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Seconds since local midnight — the Time column's sort key. */
function toSecondsOfDay(value: string | number | null | undefined): number {
  const ms = toTimestamp(value);
  if (!ms) {
    return 0;
  }
  const at = new Date(ms);
  return at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
}

export interface VerificationItem {
  id: number;
  productCode: string;
  productName: string;
  batchNo: string;
  dateCode: string;
  manufacturerName: string;
  manufacturingDate: string;
  expiryDate: string;
  netWeight: number;
  unitWeight: string;
  isActive: boolean;
  status: string;
  /** When the capture was recorded — the source of the Date and Time columns. */
  createddate: string | number | null;
}

interface Envelope<T> {
  status: { message: string; userMessage?: string };
  response: T;
}

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verification.component.html',
  styleUrl: './verification.component.css',
})
export class VerificationComponent {
  private readonly httpGet = inject(HttpGetService);
  private readonly httpPut = inject(HttpPutService);
  private readonly materialApi = inject(MaterialApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _items = signal<VerificationItem[]>([]);
  readonly items = this._items.asReadonly();

  readonly products = signal<ProductRow[]>([]);

  // Load window — these two go to the server and decide what gets fetched at all.
  readonly statusOptions = STATUS_OPTIONS;
  readonly dateWindowOptions = DATE_WINDOW_OPTIONS;
  readonly statusFilter = signal('NEW');
  readonly dateWindow = signal<DateWindow>('ANY');
  readonly customFrom = signal('');
  readonly customTo = signal('');

  /**
   * True while the screen is showing its default slice. Only then does an empty result
   * genuinely mean "nothing to verify" — otherwise it means the window excluded it, and
   * the table has to stay on screen so the reviewer can widen it.
   */
  readonly hasDefaultWindow = computed(() => this.statusFilter() === 'NEW' && this.dateWindow() === 'ANY');

  /** Plain-English echo of the load window, so an empty table explains itself. */
  readonly loadSummary = computed(() => {
    const status = STATUS_OPTIONS.find((o) => o.value === this.statusFilter())?.label ?? this.statusFilter();
    const window = DATE_WINDOW_OPTIONS.find((o) => o.value === this.dateWindow())?.label ?? '';
    return `${status} · ${window.toLowerCase()}`;
  });

  // Column filters — each one sits under the column it acts on, applied
  // client-side against the already-loaded list.
  readonly filterProduct = signal('');
  readonly filterBatch = signal('');
  readonly filterManufacturer = signal('');
  readonly filterManufactureDate = signal('');
  readonly filterExpiryDate = signal('');

  // Free-text search across product and manufacturer, layered on top of the columns.
  readonly searchTerm = signal('');

  readonly hasActiveFilters = computed(
    () =>
      !!this.filterProduct() ||
      !!this.filterBatch() ||
      !!this.filterManufacturer() ||
      !!this.filterManufactureDate() ||
      !!this.filterExpiryDate() ||
      !!this.searchTerm().trim(),
  );

  readonly filteredItems = computed(() => {
    const product = this.filterProduct();
    const batch = this.filterBatch().trim().toLowerCase();
    const manufacturer = this.filterManufacturer().trim().toLowerCase();
    const mfgDate = this.filterManufactureDate();
    const expDate = this.filterExpiryDate();
    const term = this.searchTerm().trim().toLowerCase();

    return this._items().filter((item) => {
      if (product && item.productName !== product) {
        return false;
      }
      if (batch && !item.batchNo.toLowerCase().includes(batch)) {
        return false;
      }
      if (manufacturer && !item.manufacturerName.toLowerCase().includes(manufacturer)) {
        return false;
      }
      if (mfgDate && toDateOnly(item.manufacturingDate) !== mfgDate) {
        return false;
      }
      if (expDate && toDateOnly(item.expiryDate) !== expDate) {
        return false;
      }
      if (term) {
        const haystack = `${item.productName} ${item.manufacturerName}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }
      return true;
    });
  });

  readonly columns = VERIFICATION_COLUMNS;
  // Null until the reviewer picks a column, so the list first appears in server order.
  readonly sortKey = signal<VerificationSortKey | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('asc');

  /** Sorted before paging, so the order runs across every record rather than one page of it. */
  readonly sortedItems = computed(() => {
    const key = this.sortKey();
    if (!key) {
      return this.filteredItems();
    }
    const direction = this.sortDir() === 'asc' ? 1 : -1;
    return [...this.filteredItems()].sort((a, b) => direction * compareItems(a, b, key));
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize())));
  readonly pagedItems = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.sortedItems().slice(start, start + size);
  });

  /** Clicking the active column flips direction; a new column opens on its most useful end. */
  sortBy(key: VerificationSortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      // Heaviest and latest-dated first read better than the reverse; text reads A→Z.
      this.sortDir.set(DESCENDING_FIRST.has(key) ? 'desc' : 'asc');
    }
    this.currentPage.set(1);
  }

  sortArrow(key: VerificationSortKey): string {
    return this.sortKey() === key && this.sortDir() === 'asc' ? '▲' : '▼';
  }

  ariaSort(key: VerificationSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  unitSymbol(unitWeight: string): string {
    return toUnitSymbol(unitWeight);
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

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly actioningId = signal<number | null>(null);
  readonly actionError = signal<string | null>(null);

  constructor() {
    this.load();
    this.materialApi.listProducts().subscribe((rows) => this.products.set(rows));
  }

  onFilterChange<T>(target: WritableSignal<T>, value: T): void {
    target.set(value);
    this.currentPage.set(1);
  }

  /** Status and the date window change what the server sends, so both refetch. */
  onStatusFilterChange(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.load();
  }

  onDateWindowChange(window: DateWindow): void {
    this.dateWindow.set(window);
    this.currentPage.set(1);
    // A custom range isn't a window until both ends are picked — wait for them.
    if (window !== 'CUSTOM') {
      this.load();
    }
  }

  onCustomDateChange(target: WritableSignal<string>, value: string): void {
    target.set(value);
    this.currentPage.set(1);
    if (this.customFrom() && this.customTo()) {
      this.load();
    }
  }

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

  /** Clears the in-table refinements only — the load window is its own control. */
  clearFilters(): void {
    this.filterProduct.set('');
    this.filterBatch.set('');
    this.filterManufacturer.set('');
    this.filterManufactureDate.set('');
    this.filterExpiryDate.set('');
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  /** Resolves the chosen window to the inclusive fromDt/toDt the API takes. */
  private resolveDateRange(): { fromDt: string; toDt: string } | null {
    const window = this.dateWindow();
    if (window === 'CUSTOM') {
      const from = this.customFrom();
      const to = this.customTo();
      return from && to ? { fromDt: from, toDt: to } : null;
    }
    const days = WINDOW_DAYS[window];
    if (!days) {
      return null;
    }
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - (days - 1));
    return { fromDt: toIsoDay(from), toDt: toIsoDay(today) };
  }

  private buildQuery(): string {
    const params = new URLSearchParams({ status: this.statusFilter() });
    const range = this.resolveDateRange();
    if (range) {
      params.set('fromDt', range.fromDt);
      params.set('toDt', range.toDt);
    }
    return params.toString();
  }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.httpGet
      .getSfa<Envelope<VerificationItem[]>>(`api/weightscaleproducts?${this.buildQuery()}`)
      .pipe(
        map((env) => env.response ?? []),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (rows) => {
          this._items.set(rows);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.loadError.set(`Unable to load pending verifications. (${err?.status ?? 'network error'})`);
          this.isLoading.set(false);
        },
      });
  }

  async approve(item: VerificationItem): Promise<void> {
    const confirmed = await this.confirm(item, 'APPROVED');
    if (confirmed) {
      this.setStatus(item, 'APPROVED');
    }
  }

  async reject(item: VerificationItem): Promise<void> {
    const confirmed = await this.confirm(item, 'REJECTED');
    if (confirmed) {
      this.setStatus(item, 'REJECTED');
    }
  }

  private async confirm(item: VerificationItem, status: VerificationStatus): Promise<boolean> {
    const verb = status === 'APPROVED' ? 'approve' : 'reject';
    const result = await Swal.fire({
      icon: 'question',
      title: `${verb === 'approve' ? 'Approve' : 'Reject'} this capture?`,
      text: `${item.productName} — Batch ${item.batchNo}`,
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'No',
      confirmButtonColor: status === 'APPROVED' ? '#16a34a' : '#dc2626',
    });
    return result.isConfirmed;
  }

  private async setStatus(item: VerificationItem, status: VerificationStatus): Promise<void> {
    if (this.actioningId()) {
      return;
    }
    this.actioningId.set(item.id);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.httpPut.putSfa(`api/weightscaleproduct/${item.id}/status?status=${status}`, {}));
      this._items.update((rows) => rows.map((row) => (row.id === item.id ? { ...row, status } : row)));
    } catch (err) {
      const message = (err as { error?: { status?: { userMessage?: string; message?: string } } })?.error?.status;
      this.actionError.set(
        message?.userMessage ?? message?.message ?? `Could not update "${item.productCode}" to ${status}.`,
      );
    } finally {
      this.actioningId.set(null);
    }
  }
}
