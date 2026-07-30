import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { SetupFacade } from '../setup.facade';
import { deriveCode } from '../../services/masters/material-api.service';

const LAST_CATEGORY_KEY = 'setup-last-category';

// Product create, kept deliberately tiny: name + category. Codes are derived
// from the name behind the scenes and never shown (owner direction) — units
// and inventory type stay visible in the Details toggle for the rare change.
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
})
export class ProductCardComponent {
  protected readonly facade = inject(SetupFacade);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    materialName: ['', Validators.required],
    materialCategoryCode: [localStorage.getItem(LAST_CATEGORY_KEY) ?? '', Validators.required],
    invTypeCode: [''], // blank = facade default
    defaultUom: [''],
  });

  readonly showDetails = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);
  private savedNameTimeout?: ReturnType<typeof setTimeout>;

  readonly hasCategories = computed(() => this.facade.categories().length > 0);

  /** code → display name, for the table's Category column. */
  readonly categoryNames = computed(() => {
    const names = new Map<string, string>();
    for (const cat of this.facade.categories()) {
      names.set(cat.categoryCode, cat.categoryName || cat.categoryCode);
    }
    return names;
  });

  categoryName(code: string | null): string {
    if (!code) {
      return '—';
    }
    return this.categoryNames().get(code) ?? code;
  }

  readonly searchTerm = signal('');
  readonly filteredProducts = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const products = this.facade.products();
    if (!term) {
      return products;
    }
    return products.filter(
      (product) =>
        product.materialName.toLowerCase().includes(term) ||
        this.categoryName(product.materialCategoryCode).toLowerCase().includes(term),
    );
  });

  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredProducts().length / this.pageSize())));
  readonly pagedProducts = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    const start = (page - 1) * size;
    return this.filteredProducts().slice(start, start + size);
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

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const name = raw.materialName.trim();
    this.saving.set(true);
    this.error.set(null);
    this.savedName.set(null);
    try {
      await this.facade.createProduct({
        materialName: name,
        materialCode: deriveCode(name),
        materialCategoryCode: raw.materialCategoryCode,
        invTypeCode: raw.invTypeCode || this.facade.defaultInvType(),
        defaultUom: raw.defaultUom || this.facade.defaultUom(),
        multiplier : 1,
        isactive:true
      });
      localStorage.setItem(LAST_CATEGORY_KEY, raw.materialCategoryCode);
      this.savedName.set(name);
      this.form.controls.materialName.reset('');
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
  return status?.userMessage ?? status?.message ?? 'Could not save the product.';
}
