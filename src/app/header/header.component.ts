import { Component, ElementRef, EventEmitter, HostListener, Output, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { UtilService } from '../services/util.service';
import { ThemeName, ThemeService } from '../services/theme.service';

import { SyncStatusComponent } from './sync-status/sync-status.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [SyncStatusComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  @Output() toggleSidebar = new EventEmitter<void>();

  readonly dropdownOpen = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly util: UtilService,
    readonly themeService: ThemeService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  get userName(): string | null {
    return this.auth.currentUserName();
  }

  get userInitials(): string {
    return this.userName ? this.userName.trim().charAt(0).toUpperCase() : '?';
  }

  toggleDropdown(): void {
    this.dropdownOpen.update((open) => !open);
  }

  setTheme(theme: ThemeName): void {
    this.themeService.setTheme(theme);
  }

  logout(): void {
    this.dropdownOpen.set(false);
    this.util.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.dropdownOpen.set(false);
    }
  }
}
