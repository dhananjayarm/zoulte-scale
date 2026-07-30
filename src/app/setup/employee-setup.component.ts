import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmployeeCardComponent } from './employee-card/employee-card.component';

// Routed page for the "Setup → Employee" menu entry.
@Component({
  selector: 'app-employee-setup',
  standalone: true,
  imports: [EmployeeCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-setup.component.html',
  styleUrl: './setup-page.css',
})
export class EmployeeSetupComponent {}
