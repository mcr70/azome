import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/azome/auth.service';
import { ProfileService } from './services/azure/profile.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const ACTIVE_ROUTE_KEY = 'azome.activeRoute';
const PERSPECTIVE_ROUTES: Record<string, string> = {
  '/rg': 'resources',
  '/networking': 'networking',
  '/monitoring': 'monitoring',
  '/data': 'data'
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet], 
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  public activeUserEmail: string | null = null;
  public userName: string | null = null;
  public selectedPerspective = 'resources';
  private readonly destroy$ = new Subject<void>();

  constructor(
    public auth: AuthService,
    private azure: ProfileService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (!(event instanceof NavigationEnd)) {
          return;
        }

        const route = event.urlAfterRedirects;
        const routePath = route.split(/[?#]/)[0];
        const perspectiveRoute = this.perspectiveRoute(routePath);
        if (perspectiveRoute) {
          this.selectedPerspective = perspectiveRoute.perspective;
          window.sessionStorage.setItem(ACTIVE_ROUTE_KEY, route);
        }
      });

    // Listen for authentication state changes and react accordingly
    this.auth.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isAuth) => {
        if (isAuth) {
          this.loadAzureData(); // Haetaan profiili yläpalkkia varten
          this.restorePerspectiveRoute();
        } else {
          this.userName = null;
          this.activeUserEmail = null;
        }
      });

    // track active user email for header display
    this.auth.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe((account) => {
        this.activeUserEmail = account ? account.username : null;
      });
  }

  public changePerspective(event: Event): void {
    const perspective = (event.target as HTMLSelectElement).value;
    this.selectedPerspective = perspective;
    const routes: Record<string, string> = {
      resources: '/rg',
      networking: '/networking',
      monitoring: '/monitoring',
      data: '/data'
    };
    this.router.navigate([routes[perspective] ?? '/rg']);
  }

  private restorePerspectiveRoute(): void {
    const currentPath = this.router.url.split(/[?#]/)[0];
    const browserPath = window.location.pathname;

    if (this.perspectiveRoute(currentPath) || this.perspectiveRoute(browserPath)) {
      return;
    }

    const savedRoute = window.sessionStorage.getItem(ACTIVE_ROUTE_KEY);
    const savedPath = savedRoute?.split(/[?#]/)[0] ?? '';
    const route = savedRoute && this.perspectiveRoute(savedPath) ? savedRoute : '/rg';
    const perspective = this.perspectiveRoute(route.split(/[?#]/)[0]);
    this.selectedPerspective = perspective?.perspective ?? 'resources';
    this.router.navigateByUrl(route);
  }

  private perspectiveRoute(route: string): { perspective: string } | null {
    const matchingRoute = Object.keys(PERSPECTIVE_ROUTES)
      .find((path) => route === path || route.startsWith(`${path}/`));

    return matchingRoute
      ? { perspective: PERSPECTIVE_ROUTES[matchingRoute] }
      : null;
  }

  // Fetch Azure profile data to display in the header
  private loadAzureData(): void {
    this.azure.getMyProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.userName = profile.displayName;
        },
        error: (err) => {
          console.error('Failed to pull Azure profile data:', err);
          this.userName = 'Unknown User'; 
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
