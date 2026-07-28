import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SetupFacade } from './setup.facade';
import { CategoryCardComponent } from './category-card/category-card.component';

// Routed page for the "Setup → Category" menu entry.
@Component({
  selector: 'app-category-setup',
  standalone: true,
  imports: [CategoryCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SetupFacade],
  templateUrl: './category-setup.component.html',
  styleUrl: './setup-page.css',
})
export class CategorySetupComponent {
  protected readonly facade = inject(SetupFacade);

  constructor() {
    this.facade.load();
  }
}
