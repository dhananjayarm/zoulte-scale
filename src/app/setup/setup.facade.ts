// Orchestration + state for the Setup page: loads the four master lists once,
// exposes pharma-sensible defaults, and refreshes the right list after each
// create. Pages stay dumb; both cards talk only to this facade.
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import {
  MaterialApiService,
  type CategoryCreate,
  type CategoryRow,
  type InvTypeRow,
  type ProductCreate,
  type ProductRow,
  type UomRow,
} from '../services/masters/material-api.service';

@Injectable()
export class SetupFacade {
  private readonly api = inject(MaterialApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _categories = signal<CategoryRow[]>([]);
  private readonly _products = signal<ProductRow[]>([]);
  private readonly _uoms = signal<UomRow[]>([]);
  private readonly _invTypes = signal<InvTypeRow[]>([]);

  readonly categories = this._categories.asReadonly();
  readonly products = this._products.asReadonly();
  readonly uoms = this._uoms.asReadonly();
  readonly invTypes = this._invTypes.asReadonly();
  readonly loadError = signal<string | null>(null);

  // Starts true: the cards must not claim "no products yet" before the first
  // response lands — on a master-data screen that reads as data loss.
  private readonly _isLoading = signal(true);
  readonly isLoading = this._isLoading.asReadonly();

  /** Readable name for the default unit — operators shouldn't have to know "GMS". */
  readonly defaultUomLabel = computed(() => {
    const code = this.defaultUom();
    return this._uoms().find((u) => u.uomCode === code)?.uomName || code;
  });

  readonly defaultInvTypeLabel = computed(() => {
    const code = this.defaultInvType();
    return this._invTypes().find((t) => t.invTypeCode === code)?.description || code;
  });

  /** How many products sit in each category — the number that makes the list useful. */
  readonly productCountByCategory = computed(() => {
    const counts = new Map<string, number>();
    for (const product of this._products()) {
      const code = product.materialCategoryCode;
      if (code) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    return counts;
  });

  /** Pharma default: gram-family unit if the tenant has one, else first UOM. */
  readonly defaultUom = computed(() => {
    const uoms = this._uoms();
    const gram = uoms.find((u) => /gram|^gm?$/i.test(u.uomCode) || /gram/i.test(u.uomName ?? ''));
    return (gram ?? uoms[0])?.uomCode ?? '';
  });

  /** Finished goods when available — the only type that makes sense for packs. */
  readonly defaultInvType = computed(() => {
    const types = this._invTypes();
    const fg = types.find((t) => t.invTypeCode === 'FG');
    return (fg ?? types[0])?.invTypeCode ?? '';
  });

  load(): void {
    // Master dropdowns are optional context — soft-fail each so one broken
    // endpoint doesn't blank the whole Setup page.
    forkJoin({
      categories: this.api.listCategories().pipe(catchError(() => of(null))),
      products: this.api.listProducts().pipe(catchError(() => of(null))),
      uoms: this.api.listUoms().pipe(catchError(() => of(null))),
      invTypes: this.api.listInventoryTypes().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ categories, products, uoms, invTypes }) => {
        if (!categories && !products) {
          this.loadError.set('Unable to load masters from the server.');
        }
        this._categories.set(categories ?? []);
        this._products.set(products ?? []);
        this._uoms.set(uoms ?? []);
        this._invTypes.set(invTypes ?? []);
        this._isLoading.set(false);
      });
  }

  async createCategory(input: CategoryCreate): Promise<void> {
    await firstValueFrom(this.api.createCategory(input));
    this.reloadCategories();
  }

  async createProduct(input: ProductCreate): Promise<void> {
    await firstValueFrom(this.api.createProduct(input));
    this.reloadProducts();
  }

  private reloadCategories(): void {
    this.api
      .listCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this._categories.set(rows));
  }

  private reloadProducts(): void {
    this.api
      .listProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rows) => this._products.set(rows));
  }
}
