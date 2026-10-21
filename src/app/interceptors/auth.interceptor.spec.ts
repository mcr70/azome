import { HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { AuthenticationResult, InteractionRequiredAuthError } from '@azure/msal-browser';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor Log Analytics requests', () => {
  let interceptor: AuthInterceptor;
  let auth: jasmine.SpyObj<MsalService>;
  let handler: jasmine.SpyObj<HttpHandler>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<MsalService>('MsalService', [
      'acquireTokenSilent', 'acquireTokenRedirect', 'loginRedirect'
    ]);
    auth.acquireTokenSilent.and.returnValue(of({ accessToken: 'logs-token' } as AuthenticationResult));
    auth.acquireTokenRedirect.and.returnValue(of(undefined));
    handler = jasmine.createSpyObj<HttpHandler>('HttpHandler', ['handle']);
    handler.handle.and.returnValue(of(new HttpResponse({ status: 200 })));
    interceptor = new AuthInterceptor(auth);
  });

  it('adds the delegated Log Analytics token to local and deployed proxy requests', async () => {
    for (const baseUrl of ['', 'https://proxy.example.com']) {
      const request = new HttpRequest('GET',
        `${baseUrl}/log-analytics-proxy/v1/workspaces/workspace/metadata`
      );
      await firstValueFrom(interceptor.intercept(request, handler));
      expect(auth.acquireTokenSilent).toHaveBeenCalledWith({
        scopes: ['https://api.loganalytics.io/Data.Read']
      });
      expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization'))
        .toBe('Bearer logs-token');
    }
  });

  it('requests interactive consent when required without sending an unauthenticated request', () => {
    auth.acquireTokenSilent.and.returnValue(throwError(() => ({ errorCode: 'consent_required' })));
    interceptor.intercept(
      new HttpRequest('GET', '/log-analytics-proxy/v1/workspaces/workspace/metadata'), handler
    ).subscribe();
    expect(auth.acquireTokenRedirect).toHaveBeenCalledOnceWith({
      scopes: ['https://api.loganalytics.io/Data.Read'],
      prompt: 'consent'
    });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('recovers from MSAL invalid_grant with the consent_required suberror', () => {
    auth.acquireTokenSilent.and.returnValue(throwError(() => new InteractionRequiredAuthError(
      'invalid_grant', 'AADSTS65001: The user or administrator has not consented.', 'consent_required'
    )));
    interceptor.intercept(
      new HttpRequest('GET', '/log-analytics-proxy/v1/workspaces/workspace/metadata'), handler
    ).subscribe();
    expect(auth.acquireTokenRedirect).toHaveBeenCalledOnceWith({
      scopes: ['https://api.loganalytics.io/Data.Read'],
      prompt: 'consent'
    });
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('recognizes consent suberrors and AADSTS65001 in plain error objects', () => {
    for (const error of [
      { errorCode: 'invalid_grant', subError: 'consent_required' },
      { errorCode: 'invalid_grant', message: 'AADSTS65001: Consent required.' }
    ]) {
      auth.acquireTokenSilent.and.returnValue(throwError(() => error));
      const instance = new AuthInterceptor(auth);
      instance.intercept(
        new HttpRequest('GET', '/log-analytics-proxy/v1/workspaces/workspace/metadata'), handler
      ).subscribe();
    }
    expect(auth.acquireTokenRedirect).toHaveBeenCalledTimes(2);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('starts only one consent redirect for concurrent workspace requests', () => {
    auth.acquireTokenSilent.and.returnValue(throwError(() => ({ errorCode: 'consent_required' })));
    for (const endpoint of ['metadata', 'query']) {
      interceptor.intercept(
        new HttpRequest('GET', `/log-analytics-proxy/v1/workspaces/workspace/${endpoint}`), handler
      ).subscribe();
    }
    expect(auth.acquireTokenRedirect).toHaveBeenCalledTimes(1);
  });

  it('surfaces redirect failures and allows consent to be retried', () => {
    auth.acquireTokenSilent.and.returnValue(throwError(() => ({ errorCode: 'consent_required' })));
    const failure = new Error('Redirect failed');
    auth.acquireTokenRedirect.and.returnValue(throwError(() => failure));
    const error = jasmine.createSpy('error');
    const request = new HttpRequest('GET', '/log-analytics-proxy/v1/workspaces/workspace/metadata');
    interceptor.intercept(request, handler).subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
    auth.acquireTokenRedirect.and.returnValue(of(undefined));
    interceptor.intercept(request, handler).subscribe();
    expect(auth.acquireTokenRedirect).toHaveBeenCalledTimes(2);
  });

  it('does not redirect unrelated invalid_grant failures', () => {
    const failure = { errorCode: 'invalid_grant', message: 'Unrelated authentication failure' };
    auth.acquireTokenSilent.and.returnValue(throwError(() => failure));
    const error = jasmine.createSpy('error');
    interceptor.intercept(
      new HttpRequest('GET', '/log-analytics-proxy/v1/workspaces/workspace/metadata'), handler
    ).subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
    expect(auth.acquireTokenRedirect).not.toHaveBeenCalled();
  });

  it('keeps ARM requests on the ARM scope', async () => {
    await firstValueFrom(interceptor.intercept(
      new HttpRequest('GET', 'https://management.azure.com/subscriptions'), handler
    ));
    expect(auth.acquireTokenSilent).toHaveBeenCalledOnceWith({
      scopes: ['https://management.azure.com/user_impersonation']
    });
  });
});