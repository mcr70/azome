import { Injectable } from '@angular/core';
import { MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { InteractionStatus, AccountInfo, EventMessage, EventType } from '@azure/msal-browser';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<AccountInfo | null>(null);
  public user$: Observable<AccountInfo | null> = this.userSubject.asObservable();

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$: Observable<boolean> = this.isAuthenticatedSubject.asObservable();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private msalService: MsalService,
    private msalBroadcastService: MsalBroadcastService
  ) {
    console.log('[MSAL-Auth] AuthService constructor triggered. Current URL:', window.location.href);

    // 1. Monitor ALL MSAL events
    this.msalBroadcastService.msalSubject$
      .pipe(
        filter((msg: EventMessage) => 
          msg.eventType === EventType.LOGIN_SUCCESS || 
          msg.eventType === EventType.HANDLE_REDIRECT_END
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((msg) => {
        console.log(`[MSAL-Auth] Event received: ${msg.eventType}`, msg);
        this.checkAccountStatus();
      });

    // 2. Track when active interactions completely finish
    this.msalBroadcastService.inProgress$
      .pipe(
        filter((status: InteractionStatus) => status === InteractionStatus.None),
        takeUntil(this.destroy$)
      )
      .subscribe((status) => {
        console.log('[MSAL-Auth] Interaction status is now NONE (idle)', status);
        this.checkAccountStatus();
      });

    // 3. Trigger initial boot-up flow and evaluate incoming redirect URLs
    console.log('[MSAL-Auth] Launching msalService.initialize()...');
    this.msalService.initialize().subscribe({
      next: () => {
        console.log('[MSAL-Auth] msalService.initialize() SUCCESS');
        
        this.msalService.handleRedirectObservable().subscribe({
          next: (response) => {
            console.log('[MSAL-Auth] handleRedirectObservable completed. Response:', response);
            if (response) {
              console.log('[MSAL-Auth] Token found in redirect URL! Setting active account:', response.account.username);
              this.msalService.instance.setActiveAccount(response.account);
            }
            
            // CLEANUP URL: If there are auth parameters in the URL, wipe them clean now
            if (window.location.search || window.location.hash) {
              console.log('[MSAL-Auth] Cleaning up auth parameters from URL bar...');
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            this.checkAccountStatus();
          },
          error: (err) => {
            console.error('[MSAL-Auth] Redirect URL processing failed:', err);
            
            // CLEANUP URL ON ERROR: Even if it fails (like state_mismatch), clear the bad URL parameters!
            if (window.location.search || window.location.hash) {
              console.log('[MSAL-Auth] Cleaning up BAD auth parameters from URL bar...');
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            this.checkAccountStatus();
          }
        });
      },
      error: (err) => console.error('[MSAL-Auth] MSAL critical initialization failed:', err)
    });
  }

  private checkAccountStatus(): void {
    const accounts = this.msalService.instance.getAllAccounts();
    console.log('[MSAL-Auth] checkAccountStatus called. Found accounts in cache:', accounts.length, accounts);

    if (accounts.length > 0) {
      const activeAccount = this.msalService.instance.getActiveAccount() || accounts[0];
      console.log('[MSAL-Auth] Resolving active account:', activeAccount.username);
      
      if (!this.msalService.instance.getActiveAccount()) {
        console.log('[MSAL-Auth] No active account set in MSAL instance. Fixing it now...');
        this.msalService.instance.setActiveAccount(activeAccount);
      }
      
      if (this.userSubject.value?.username !== activeAccount.username) {
        console.log('[MSAL-Auth] Pushing account info to user$ stream');
        this.userSubject.next(activeAccount);
      }
      
      if (!this.isAuthenticatedSubject.value) {
        console.log('[MSAL-Auth] Flipping isAuthenticated$ to TRUE');
        this.isAuthenticatedSubject.next(true);
      }
    } else {
      console.log('[MSAL-Auth] No accounts found. User is anonymous.');
      if (this.userSubject.value !== null) this.userSubject.next(null);
      if (this.isAuthenticatedSubject.value !== false) this.isAuthenticatedSubject.next(false);
    }
  }

  public login(): void {
    console.log('[MSAL-Auth] login() called.');
    
    this.msalService.loginRedirect({
      scopes: ['user.read', 'https://management.azure.com/user_impersonation'],
      prompt: 'select_account' 
    });
  }

  public logout(): void {
    console.log('[MSAL-Auth] logout() called. Purging local states...');

    this.msalService.instance.setActiveAccount(null);
    this.userSubject.next(null);
    this.isAuthenticatedSubject.next(false);

    this.msalService.logoutRedirect({
      postLogoutRedirectUri: 'http://localhost:4200/'
    });
  }

  public dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}