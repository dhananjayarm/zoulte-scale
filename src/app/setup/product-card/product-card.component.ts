import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SetupFacade } from '../setup.facade';
import { deriveCode } from '../../services/masters/material-api.service';

const LAST_CATEGORY_KEY = 'setup-last-category';

// Product create, kept deliberately tiny: name + category. Codes are derived
// from the name behind the scenes and never shown (owner direction) — units
// and inventory type stay visible in the Details toggle for the rare change.
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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
      });
      localStorage.setItem(LAST_CATEGORY_KEY, raw.materialCategoryCode);
      this.savedName.set(name);
      this.form.controls.materialName.reset('');
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
