import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import Swal from 'sweetalert2';
import { HttpGetService } from '../services/http-get.service';
import { HttpPutService } from '../services/http-put.service';
import { MaterialApiService, type ProductRow } from '../services/masters/material-api.service';

type VerificationStatus = 'APPROVED' | 'REJECTED';

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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  // Filters — applied client-side against the already-loaded list.
  readonly filterProduct = signal('');
  readonly filterManufactureDate = signal('');
  readonly filterExpiryDate = signal('');
  readonly filterStatus = signal('');

  // Free-text search, layered on top of the dropdown/date filters above.
  readonly searchTerm = signal('');

  readonly filteredItems = computed(() => {
    const product = this.filterProduct();
    const mfgDate = this.filterManufactureDate();
    const expDate = this.filterExpiryDate();
    const status = this.filterStatus();
    const term = this.searchTerm().trim().toLowerCase();

    return this._items().filter((item) => {
      if (product && item.productName !== product) {
        return false;
      }
      if (mfgDate && toDateOnly(item.manufacturingDate) !== mfgDate) {
        return false;
      }
      if (expDate && toDateOnly(item.expiryDate) !== expDate) {
        return false;
      }
      if (status && item.status !== status) {
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

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize())));
  readonly pagedItems = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredItems().slice(start, start + size);
  });

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

  clearFilters(): void {
    this.filterProduct.set('');
    this.filterManufactureDate.set('');
    this.filterExpiryDate.set('');
    this.filterStatus.set('');
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.httpGet
      .getSfa<Envelope<VerificationItem[]>>('api/weightscaleproducts')
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
