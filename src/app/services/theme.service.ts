import { Injectable, signal } from '@angular/core';

export type ThemeName = 'blue' | 'orange';

const STORAGE_KEY = 'theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeName>(this.readStoredTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  setTheme(theme: ThemeName): void {
    this.theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.applyTheme(theme);
  }

  private readStoredTheme(): ThemeName {
    return localStorage.getItem(STORAGE_KEY) === 'orange' ? 'orange' : 'blue';
  }

  private applyTheme(theme: ThemeName): void {
    document.body.classList.toggle('theme-orange', theme === 'orange');
    document.body.classList.toggle('theme-blue', theme === 'blue');
  }
}
