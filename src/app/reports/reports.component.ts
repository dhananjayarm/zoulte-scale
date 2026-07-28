import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MenuItem, MenuService } from '../services/menu.service';

type IconKey = 'calendar' | 'clock' | 'alert' | 'check' | 'document';

const ICON_KEYWORDS: Record<IconKey, string[]> = {
  calendar: ['calendar', 'date', 'month'],
  clock: ['clock', 'time', 'overtime', 'punctual'],
  alert: ['alert', 'warning', 'incomplete', 'error'],
  check: ['check', 'approved', 'present', 'attendance'],
  document: [],
};

function resolveIconKey(icon: string | null): IconKey {
  const value = (icon ?? '').toLowerCase();
  for (const key of Object.keys(ICON_KEYWORDS) as IconKey[]) {
    if (ICON_KEYWORDS[key].some((keyword) => value.includes(keyword))) {
      return key;
    }
  }
  return 'document';
}

const CARD_COLORS = ['orange', 'blue', 'yellow', 'purple', 'green', 'red'] as const;
type CardColor = (typeof CARD_COLORS)[number];

export interface ReportCard {
  item: MenuItem;
  iconKey: IconKey;
  color: CardColor;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css',
})
export class ReportsComponent implements OnInit {
  readonly cards = signal<ReportCard[]>([]);
  readonly loadError = signal<string | null>(null);
  readonly isLoading = signal(true);

  constructor(private readonly menuService: MenuService) {}

  ngOnInit(): void {
    this.menuService.getReports().subscribe({
      next: (items) => {
        this.cards.set(
          items.map((item, index) => ({
            item,
            iconKey: resolveIconKey(item.icon),
            color: CARD_COLORS[index % CARD_COLORS.length],
          }))
        );
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load reports.');
        this.isLoading.set(false);
      },
    });
  }

  linkFor(item: MenuItem): string {
    return item.link.startsWith('/') ? item.link : `/${item.link}`;
  }
}
