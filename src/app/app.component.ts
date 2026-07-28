import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { ThemeService } from './services/theme.service';
import { SyncService } from './services/sync/sync.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'zoulte-scale';

  readonly sidebarCollapsed = signal(true);
  readonly isAuthPage = signal(false);

  constructor(private readonly router: Router) {
    inject(ThemeService);
    // Background outbox drain — a no-op outside Electron.
    inject(SyncService).start();
    this.isAuthPage.set(this.router.url.startsWith('/login'));
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.isAuthPage.set(event.urlAfterRedirects.startsWith('/login')));
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  closeSidebar(): void {
    this.sidebarCollapsed.set(true);
  }
}
