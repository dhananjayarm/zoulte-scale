import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { UtilService } from './util.service';

// Single place where auth meets HTTP: attaches the session token to every API
// call and funnels 401s into one session-expired logout, so individual
// services never carry their own Authorization headers.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const util = inject(UtilService);
  const token = localStorage.getItem('token');
  // The login call has no token yet, and its own 401 means "bad credentials",
  // not "session expired" — leave it untouched in both directions.
  const isLoginCall = req.url.endsWith('/authenticate');

  const authedReq =
    token && !isLoginCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isLoginCall) {
        util.logout({ sessionExpired: true });
      }
      return throwError(() => err);
    }),
  );
};
