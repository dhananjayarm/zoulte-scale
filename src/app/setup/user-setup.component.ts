import { ChangeDetectionStrategy, Component } from '@angular/core';
import { UserCardComponent } from './user-card/user-card.component';

// Routed page for the "Setup → Users" menu entry.
@Component({
  selector: 'app-user-setup',
  standalone: true,
  imports: [UserCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-setup.component.html',
  styleUrl: './setup-page.css',
})
export class UserSetupComponent {}
