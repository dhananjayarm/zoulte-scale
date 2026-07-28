import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Auth headers come from authInterceptor — these services only resolve which
// backend base URL a path belongs to.
@Injectable({ providedIn: 'root' })
export class HttpPostService {
  private readonly http = inject(HttpClient);

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${environment.root_Url}${path}`, body);
  }

  postSfa<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${environment.current_url_sfa}${path}`, body);
  }
}
