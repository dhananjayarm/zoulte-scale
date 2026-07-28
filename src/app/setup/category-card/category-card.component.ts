import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SetupFacade } from '../setup.facade';
import { deriveCode } from '../../services/masters/material-api.service';

// Category create is one visible field (name); code, unit and inventory type
// come from the same defaults the product card uses.
@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedName = signal<string | null>(null);

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
