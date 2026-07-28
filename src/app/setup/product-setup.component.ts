import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupFacade } from './setup.facade';
import { ProductCardComponent } from './product-card/product-card.component';

// Routed page for the "Setup → Product" menu entry.
@Component({
  selector: 'app-product-setup',
  standalone: true,
  imports: [ProductCardComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SetupFacade],
  templateUrl: './product-setup.component.html',
  styleUrl: './setup-page.css',
})
export class ProductSetupComponent {
  protected readonly facade = inject(SetupFacade);

  constructor() {
    this.facade.load();
  }
}
