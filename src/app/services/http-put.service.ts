import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Auth headers come from authInterceptor — these services only resolve which
// backend base URL a path belongs to.
@Injectable({ providedIn: 'root' })
export class HttpPutService {
  private readonly http = inject(HttpClient);

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${environment.root_Url}${path}`, body);
  }

  putSfa<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${environment.current_url_sfa}${path}`, body);
  }
}
