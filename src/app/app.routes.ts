import { Routes } from '@angular/router';
import { authGuard } from './authentication/guards/auth.guard';
import { loginGuard } from './authentication/guards/login.guard';
import { onlineOnlyGuard } from './authentication/guards/online-only.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./authentication/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'weightscale',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./weighing/weighing.component').then((m) => m.WeighingComponent),
  },
  {
    path: 'reports',
    canActivate: [authGuard, onlineOnlyGuard],
    loadComponent: () =>
      import('./reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'reports/productReport',
    canActivate: [authGuard, onlineOnlyGuard],
    loadComponent: () =>
      import('./reports/product-report/product-report.component').then((m) => m.ProductReportComponent),
  },
  {
    path: 'reports/expiryReport',
    canActivate: [authGuard, onlineOnlyGuard],
    loadComponent: () =>
      import('./reports/expiry-report/expiry-report.component').then((m) => m.ExpiryReportComponent),
  },
  { path: 'setup', pathMatch: 'full', redirectTo: 'setup/product' },
  {
    path: 'setup/category',
    canActivate: [authGuard, onlineOnlyGuard],
    loadComponent: () =>
      import('./setup/category-setup.component').then((m) => m.CategorySetupComponent),
  },
  {
    path: 'setup/product',
    canActivate: [authGuard, onlineOnlyGuard],
    loadComponent: () =>
      import('./setup/product-setup.component').then((m) => m.ProductSetupComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'weightscale' },
  { path: '**', pathMatch: 'full', redirectTo: 'weightscale' },
];
