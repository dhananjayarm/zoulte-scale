import { ApplicationConfig, inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './services/auth.interceptor';
import { hasLocalStore } from './services/data/datastore';
import { ReadingStore } from './services/readings/reading-store';
import { LocalReadingStore } from './services/readings/local-reading-store';
import { RemoteReadingStore } from './services/readings/remote-reading-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Electron gets the offline-first SQLite store; a plain browser keeps the
    // original direct-HTTP behaviour.
    {
      provide: ReadingStore,
      useFactory: () => (hasLocalStore() ? inject(LocalReadingStore) : inject(RemoteReadingStore)),
    },
  ],
};
