import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MenuItem, MenuService } from '../services/menu.service';

export interface MenuGroup {
  header: string;
  items: MenuItem[];
}

const SETUP_MENU_ITEM: MenuItem = {
  menuId: null,
  icon: 'settings',
  link: '/setup',
  name: 'Setup',
  description: 'Products & categories',
  imgUrl: null,
  priority: 99,
  header: 'Setup',
  menuType: 'SIDEMENU',
  privType: 'WRITE',
  category: null,
  moduleCode: 'WT-SCL',
  menuAction: null,
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent implements OnInit {
  @Input() collapsed = true;
  @Output() linkClicked = new EventEmitter<void>();

  private readonly menuItems = signal<MenuItem[]>([]);
  readonly loadError = signal<string | null>(null);
  private readonly expandedHeaders = signal<Set<string>>(new Set());

  readonly menuGroups = computed<MenuGroup[]>(() => {
    const groups: MenuGroup[] = [];
    const byHeader = new Map<string, MenuGroup>();

    for (const item of this.menuItems()) {
      let group = byHeader.get(item.header);
      if (!group) {
        group = { header: item.header, items: [] };
        byHeader.set(item.header, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    // Client-side fallback until the WT-SCL menu rows are seeded server-side
    // (docs/sql/menu-inserts-wt-scl.sql) — once any server item points into
    // /setup, the server's privType decides who sees Setup and this drops out.
    const serverHasSetup = this.menuItems().some((item) => item.link.includes('/setup'));
    if (!serverHasSetup) {
      groups.push({ header: 'Setup', items: [SETUP_MENU_ITEM] });
    }
    return groups;
  });

  constructor(
    private readonly menuService: MenuService,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.menuService.getSidebarMenu().subscribe({
      next: (items) => {
        this.menuItems.set(items);
        this.expandedHeaders.set(new Set(items.map((item) => item.header)));
      },
      error: () => this.loadError.set('Unable to load menu.'),
    });
  }

  linkFor(item: MenuItem): string {
    return item.link.startsWith('/') ? item.link : `/${item.link}`;
  }

  isExpanded(header: string): boolean {
    return this.expandedHeaders().has(header);
  }

  toggleGroup(header: string): void {
    const next = new Set(this.expandedHeaders());
    if (next.has(header)) {
      next.delete(header);
    } else {
      next.add(header);
    }
    this.expandedHeaders.set(next);
  }

  get userName(): string | null {
    return this.auth.currentUserName();
  }

  get userInitials(): string {
    return this.userName ? this.userName.trim().charAt(0).toUpperCase() : '?';
  }
}
