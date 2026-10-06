import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { EMPTY, Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private loginRedirectStarted = false;

  constructor(private authService: MsalService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let scope: string[] = [];
    if (req.url.includes('management.azure.com')) { // Azure Resource Management API
      scope = ['https://management.azure.com/user_impersonation'];
    } 
    else if (req.url.includes('graph.microsoft.com')) { // Microsoft Graph API
      scope = ['User.Read'];
    } else if (req.url.includes('/cosmos-proxy/')) {
      scope = ['https://cosmos.azure.com/user_impersonation'];
    } 
    else {
      return next.handle(req); // An API request that doesn't match known patterns, skip token acquisition
    }

    return from(this.authService.acquireTokenSilent({ scopes: scope })).pipe(
      switchMap(result => {
        const isCosmosRequest = req.url.includes('/cosmos-proxy/');
        const authorization = isCosmosRequest
          ? encodeURIComponent(`type=aad&ver=1.0&sig=${result.accessToken}`)
          : `Bearer ${result.accessToken}`;
        const authReq = req.clone({
          setHeaders: { Authorization: authorization }
        });
        return next.handle(authReq);
      }),
      catchError((error) => {
        const errorCode = error?.errorCode || error?.code;
        const subError = error?.subError || error?.suberror;
        const errorMessage = String(error?.message || '');
        const refreshTokenExpired = [errorCode, subError, errorMessage]
          .some((value) => String(value || '').toLowerCase().includes('refresh_token_expired'));

        if (refreshTokenExpired) {
          if (!this.loginRedirectStarted) {
            this.loginRedirectStarted = true;
            this.authService.loginRedirect({
              scopes: scope,
              prompt: 'login'
            }).subscribe({
              error: (redirectError: unknown) => {
                console.error('Failed to start sign-in after refresh token expiry:', redirectError);
                this.loginRedirectStarted = false;
              }
            });
          }
          return EMPTY;
        }

        if (scope[0].startsWith('https://cosmos.azure.com/')
          && (errorCode === 'interaction_required' || errorCode === 'consent_required')) {
          this.authService.acquireTokenRedirect({
            scopes: scope,
            prompt: 'consent'
          });
          return EMPTY;
        }
        return throwError(() => error);
      })
    );
  }

}
