import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WeightScaleProduct {
  productName: string;
  batchNo: string;
  manufacturerName: string;
  manufacturingDate: string;
  expiryDate: string;
  netWeight: number;
  unitWeight: string;
  createdDate?: string;
  [key: string]: unknown;
}

// Auth headers come from authInterceptor — these services only resolve which
// backend base URL a path belongs to.
@Injectable({ providedIn: 'root' })
export class HttpGetService {
  private readonly http = inject(HttpClient);

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${environment.root_Url}${path}`);
  }

  getSfa<T>(path: string): Observable<T> {
    return this.http.get<T>(`${environment.current_url_sfa}${path}`);
  }

  getSfaBlob(path: string): Observable<Blob> {
    return this.http.get(`${environment.current_url_sfa}${path}`, { responseType: 'blob' });
  }
}
