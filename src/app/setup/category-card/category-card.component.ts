import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SetupFacade } from '../setup.facade';
import { deriveCode, type CategoryRow } from '../../services/masters/material-api.service';

type CategorySortKey = 'name' | 'products';

const CATEGORY_COLUMNS: ReadonlyArray<{ key: CategorySortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'products', label: 'Products' },
];

// Category create is one visible field (name); code, unit and inventory type
// come from the same defaults the product card uses.
@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-card.component.html',
  styleUrl: './category-card.component.css',
})
export class CategoryCardComponent {
  protected readonly facade = inject(SetupFacade);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    categoryName: ['', Validators.required],
  });

  // A control's .value isn't a signal, so a computed reading it would never re-run.
  private readonly nameValue = toSignal(this.form.controls.categoryName.valueChanges, { initialValue: '' });

  /** Drives the defaults line — no point showing what a nameless category would get. */
  readonly isNamed = computed(() => this.nameValue().trim().length > 0);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);
  private savedNameTimeout?: ReturnType<typeof setTimeout>;

  readonly searchTerm = signal('');
  readonly filteredCategories = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const categories = this.facade.categories();
    if (!term) {
      return categories;
    }
    return categories.filter((cat) => this.displayName(cat).toLowerCase().includes(term));
  });

  readonly columns = CATEGORY_COLUMNS;
  readonly sortKey = signal<CategorySortKey>('name');
  readonly sortDir = signal<'asc' | 'desc'>('asc');

  /** Sorted before paging, so the order runs across every category, not one page of it. */
  readonly sortedCategories = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDir() === 'asc' ? 1 : -1;
    const counts = this.facade.productCountByCategory();
    return [...this.filteredCategories()].sort((a, b) => {
      if (key === 'products') {
        return direction * ((counts.get(a.categoryCode) ?? 0) - (counts.get(b.categoryCode) ?? 0));
      }
      return direction * this.displayName(a).localeCompare(this.displayName(b));
    });
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredCategories().length / this.pageSize())));
  readonly pagedCategories = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.sortedCategories().slice(start, start + size);
  });

  displayName(category: CategoryRow): string {
    return category.categoryName || category.categoryCode;
  }

  productCount(category: CategoryRow): number {
    return this.facade.productCountByCategory().get(category.categoryCode) ?? 0;
  }

  /** Clicking the active column flips direction; a new column opens A→Z, busiest-last. */
  sortBy(key: CategorySortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'products' ? 'desc' : 'asc');
    }
    this.currentPage.set(1);
  }

  sortArrow(key: CategorySortKey): string {
    return this.sortKey() === key && this.sortDir() === 'asc' ? '▲' : '▼';
  }

  ariaSort(key: CategorySortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
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

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.controls.categoryName.value.trim();
    this.saving.set(true);
    this.error.set(null);
    this.savedName.set(null);
    try {
      await this.facade.createCategory({
        categoryName: name,
        categoryCode: deriveCode(name),
        defaultUom: this.facade.defaultUom(),
        invTypeCode: this.facade.defaultInvType(),
      });
      this.savedName.set(name);
      this.form.reset({ categoryName: '' });
      clearTimeout(this.savedNameTimeout);
      this.savedNameTimeout = setTimeout(() => this.savedName.set(null), 4000);
    } catch (err) {
      this.error.set(describeError(err));
    } finally {
      this.saving.set(false);
    }
  }
}

function describeError(err: unknown): string {
  const status = (err as { error?: { status?: { userMessage?: string; message?: string } } })?.error?.status;
  return status?.userMessage ?? status?.message ?? 'Could not save the category.';
}
