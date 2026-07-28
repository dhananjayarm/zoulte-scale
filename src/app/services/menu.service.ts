import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { HttpGetService } from './http-get.service';

export interface MenuItem {
  menuId: number | null;
  icon: string;
  link: string;
  name: string;
  description: string | null;
  imgUrl: string | null;
  priority: number;
  header: string;
  menuType: string;
  privType: string;
  category: string | null;
  moduleCode: string | null;
  menuAction: string | null;
}

interface MenuAccessResponse {
  status: { code: number; message: string; userMessage: string; timestamp: number };
  response: MenuItem[];
}

const MENU_MODULE = 'WT-SCL';

// The menuaccess endpoint also returns module_code='ALL' platform rows from
// the shared DB. The payload can't distinguish them: core's mappers never
// select module_code, so EVERY row (ours included) arrives moduleCode:null —
// filtering on it would blank the menu. Instead: this app's menu links are a
// small closed set, so anything outside the exact list is foreign and dropped.
// Matches docs/sql/menu-inserts-wt-scl.sql — a new menu row needs a line here.
// NB: bare 'setup' is deliberately absent — a foreign ALL-module row
// ("Organization Setup") links exactly '/setup'; our own rows never do.
const APP_MENU_LINKS = new Set([
  'weightscale',
  'verification',
  'balance-check',
  'reports',
  'reports/productreport',
  'reports/expiryreport',
  'setup/users',
  'setup/category',
  'setup/product',
  'setup/employee',
]);

function belongsToThisApp(item: MenuItem): boolean {
  const link = (item.link ?? '').replace(/^\//, '').toLowerCase();
  return APP_MENU_LINKS.has(link);
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private readonly httpGet: HttpGetService) {}

  getSidebarMenu(): Observable<MenuItem[]> {
    return this.fetchMenu().pipe(
      map((items) =>
        items.filter((item) => item.menuType === 'SIDEMENU').sort((a, b) => a.priority - b.priority)
      )
    );
  }

  getReports(): Observable<MenuItem[]> {
    return this.fetchMenu().pipe(
      map((items) => items.filter((item) => this.isReportItem(item)).sort((a, b) => a.priority - b.priority))
    );
  }

  private fetchMenu(): Observable<MenuItem[]> {
    return this.httpGet
      .get<MenuAccessResponse>(`api/sec/menuaccess/app?app=portal&module=${MENU_MODULE}`)
      .pipe(map((res) => (res.response ?? []).filter(belongsToThisApp)));
  }

  private isReportItem(item: MenuItem): boolean {
    const header = item.header?.toLowerCase() ?? '';
    const category = item.category?.toLowerCase() ?? '';
    return item.menuType === 'REPORT' || header.includes('report') || category.includes('report');
  }
}
