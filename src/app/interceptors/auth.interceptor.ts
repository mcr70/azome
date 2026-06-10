import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: MsalService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let scope: string[] = [];
    if (req.url.includes('management.azure.com')) { // Azure Resource Management API
      scope = ['https://management.azure.com/user_impersonation'];
    } 
    else if (req.url.includes('graph.microsoft.com')) { // Microsoft Graph API
      scope = ['User.Read'];
    } 
    else {
      return next.handle(req); // Ei suojattu resurssi
    }

    return from(this.authService.acquireTokenSilent({ scopes: scope })).pipe(
      switchMap(result => {
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${result.accessToken}` }
        });
        return next.handle(authReq);
      })
    );
  }
}