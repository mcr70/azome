import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { MSAL_INSTANCE, MSAL_INTERCEPTOR_CONFIG, MSAL_GUARD_CONFIG, MsalService, MsalGuard, MsalBroadcastService, MsalInterceptor } from '@azure/msal-angular';import { PublicClientApplication, InteractionType } from '@azure/msal-browser';
import { routes } from './app.routes';

import { environment } from '../environments/environment';

import { AuthInterceptor } from './interceptors/auth.interceptor';

import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';


class DebugInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    console.log('[DEBUG] Intercepting request to:', req.url);
    return next.handle(req);
  }
}


// Factory for MSAL Instance - initialize is now handled internally by msal-angular packaging
export function MSALInstanceFactory() {
  const msalInstance = new PublicClientApplication({
    auth: {
      clientId: environment.azure.clientId,
      authority: `https://login.microsoftonline.com/${environment.azure.tenantId}/oauth2/v2.0/token`,
      redirectUri: 'http://localhost:4200/',
      postLogoutRedirectUri: 'http://localhost:4200/'
    },
    cache: {
      cacheLocation: 'localStorage'
    }
  });

  return msalInstance;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    
    MsalService,
    MsalGuard,
    MsalBroadcastService,
    
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory
    },
    
    { provide: HTTP_INTERCEPTORS, useClass: DebugInterceptor, multi: true },
    
    // Automatic token injection configuration for Azure API calls
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,//MsalInterceptor,
      multi: true
    },
    
    // {
    //   provide: MSAL_INTERCEPTOR_CONFIG,
    //   useValue: {
    //     interactionType: InteractionType.Redirect,
    //     protectedResourceMap: new Map([
    //       ['https://graph.microsoft.com/v1.0/me', ['User.Read']],
    //       // TÄMÄ: Muutetaan muotoa varmistamaan, että scope on tismalleen oikea
    //       ['https://management.azure.com/', ['https://management.azure.com/user_impersonation']]
    //     ])
    //   }
    // },
    // MsalGuard configuration - required when using canActivate: [MsalGuard]
    {
      provide: MSAL_GUARD_CONFIG,
      useValue: {
        interactionType: InteractionType.Redirect,
        authRequest: {
          scopes: [
            'user.read',
            'https://management.azure.com/user_impersonation'
          ]
        }
      }
    }
  ]
};