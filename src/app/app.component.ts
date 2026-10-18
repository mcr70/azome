import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/azome/auth.service';
import { ProfileService } from './services/azure/profile.service';
import { ResourceGraphService } from './services/azure/resource-graph.service';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from './services/azome/resource-selection.service';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const ACTIVE_ROUTE_KEY = 'azome.activeRoute';
const SAVED_RESOURCE_GRAPH_QUERIES_KEY = 'azome.savedResourceGraphQueries';
const PERSPECTIVE_ROUTES: Record<string, string> = {
  '/rg': 'resources',
  '/networking': 'networking',
  '/monitoring': 'monitoring',
  '/data': 'data',
  '/app': 'app'
};

interface SavedResourceGraphQuery {
  name: string;
  query: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  public userName: string | null = null;
  public selectedPerspective = 'resources';
  public resourceGraphDialogOpen = false;
  public resourceGraphQuery = 'Resources | limit 10';
  public resourceGraphQueryLoading = false;
  public resourceGraphQueryError: string | null = null;
  public resourceGraphResults: unknown[] | null = null;
  public savedResourceGraphQueries: SavedResourceGraphQuery[] = [];
  public selectedSavedResourceGraphQueryName = '';
  public resourceGraphQueryName = '';
  public savedResourceGraphQueryError: string | null = null;
  private readonly destroy$ = new Subject<void>();
  private resourceGraphQuerySubscription: Subscription | null = null;

  constructor(
    public auth: AuthService,
    private azure: ProfileService,
    private resourceGraph: ResourceGraphService,
    private router: Router,
    public resourceSelection: ResourceSelectionService
  ) {}

  ngOnInit(): void {
    this.loadSavedResourceGraphQueries();

    this.router.events
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (!(event instanceof NavigationEnd)) {
          return;
        }

        this.resourceSelection.finishSelecting();

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
          this.loadAzureData();
          this.restorePerspectiveRoute();
        } else {
          this.userName = null;
          this.closeResourceGraphDialog();
        }
      });
  }

  public changePerspective(event: Event): void {
    const perspective = (event.target as HTMLSelectElement).value;
    this.selectedPerspective = perspective;
    this.resourceSelection.finishSelecting();
    const routes: Record<string, string> = {
      resources: '/rg',
      networking: '/networking',
      monitoring: '/monitoring',
      data: '/data',
      app: '/app'
    };
    this.router.navigate([routes[perspective] ?? '/rg']);
  }

  public openResourceGraphDialog(toolsMenu: HTMLDetailsElement): void {
    toolsMenu.open = false;
    this.resourceGraphQuery = 'Resources | limit 10';
    this.resourceGraphQueryName = '';
    this.selectedSavedResourceGraphQueryName = '';
    this.resourceGraphQueryError = null;
    this.savedResourceGraphQueryError = null;
    this.resourceGraphResults = null;
    this.resourceGraphDialogOpen = true;
  }

  public selectSavedResourceGraphQuery(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    this.selectedSavedResourceGraphQueryName = name;
    this.resourceGraphQueryError = null;
    this.resourceGraphResults = null;

    if (!name) {
      this.resourceGraphQuery = 'Resources | limit 10';
      this.resourceGraphQueryName = '';
      return;
    }

    const savedQuery = this.savedResourceGraphQueries.find((item) => item.name === name);
    if (savedQuery) {
      this.resourceGraphQuery = savedQuery.query;
      this.resourceGraphQueryName = savedQuery.name;
    }
  }

  public saveResourceGraphQuery(): void {
    const name = this.resourceGraphQueryName.trim();
    const query = this.resourceGraphQuery.trim();
    if (!name || !query) {
      return;
    }

    const matchingIndex = this.savedResourceGraphQueries.findIndex(
      (savedQuery) => savedQuery.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    const updatedQueries = [...this.savedResourceGraphQueries];
    const savedQuery = { name, query };

    if (matchingIndex >= 0) {
      updatedQueries[matchingIndex] = savedQuery;
    } else {
      updatedQueries.push(savedQuery);
    }

    if (!this.persistSavedResourceGraphQueries(updatedQueries)) {
      return;
    }

    this.savedResourceGraphQueries = updatedQueries;
    this.selectedSavedResourceGraphQueryName = name;
    this.resourceGraphQueryName = name;
    this.savedResourceGraphQueryError = null;
  }

  public deleteSavedResourceGraphQuery(): void {
    const name = this.selectedSavedResourceGraphQueryName;
    if (!name) {
      return;
    }

    const updatedQueries = this.savedResourceGraphQueries.filter(
      (savedQuery) => savedQuery.name !== name
    );
    if (!this.persistSavedResourceGraphQueries(updatedQueries)) {
      return;
    }

    this.savedResourceGraphQueries = updatedQueries;
    this.selectedSavedResourceGraphQueryName = '';
    this.resourceGraphQueryName = '';
    this.savedResourceGraphQueryError = null;
  }

  public runResourceGraphQuery(): void {
    const query = this.resourceGraphQuery.trim();
    if (!query || this.resourceGraphQueryLoading) {
      return;
    }

    this.resourceGraphQuerySubscription?.unsubscribe();
    this.resourceGraphQueryLoading = true;
    this.resourceGraphQueryError = null;
    this.resourceGraphResults = null;
    this.resourceGraphQuerySubscription = this.resourceGraph.executeQuery(query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.resourceGraphResults = results;
          this.resourceGraphQueryLoading = false;
          this.resourceGraphQuerySubscription = null;
        },
        error: (error: unknown) => {
          console.error('Failed to run Azure Resource Graph query:', error);
          this.resourceGraphQueryError = error instanceof Error
            ? error.message
            : 'The Resource Graph query failed. Check the query and permissions.';
          this.resourceGraphQueryLoading = false;
          this.resourceGraphQuerySubscription = null;
        }
      });
  }

  public closeResourceGraphDialog(): void {
    this.resourceGraphQuerySubscription?.unsubscribe();
    this.resourceGraphQuerySubscription = null;
    this.resourceGraphQueryLoading = false;
    this.resourceGraphDialogOpen = false;
  }

  public toSelectedAzureResource(result: unknown): SelectedAzureResource | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const row = result as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string'
      || typeof row['name'] !== 'string'
      || typeof row['type'] !== 'string'
    ) {
      return null;
    }

    return {
      id: row['id'],
      name: row['name'],
      type: row['type'],
      resourceGroup: typeof row['resourceGroup'] === 'string' ? row['resourceGroup'] : ''
    };
  }

  public addToSelection(resource: SelectedAzureResource): void {
    this.resourceSelection.select(resource);
  }

  public addAllResultsToSelection(): void {
    for (const result of this.resourceGraphResults ?? []) {
      const resource = this.toSelectedAzureResource(result);
      if (resource) {
        this.resourceSelection.select(resource);
      }
    }
  }

  private loadSavedResourceGraphQueries(): void {
    try {
      const storedValue = window.localStorage.getItem(SAVED_RESOURCE_GRAPH_QUERIES_KEY);
      if (!storedValue) {
        return;
      }

      const parsedValue: unknown = JSON.parse(storedValue);
      if (!Array.isArray(parsedValue) || !parsedValue.every((item) => this.isSavedQuery(item))) {
        throw new Error('Saved Resource Graph queries have an invalid format.');
      }

      this.savedResourceGraphQueries = parsedValue;
    } catch (error) {
      console.error('Failed to load saved Resource Graph queries:', error);
      this.savedResourceGraphQueryError = error instanceof Error
        ? error.message
        : 'Saved Resource Graph queries could not be loaded from local storage.';
    }
  }

  private persistSavedResourceGraphQueries(queries: SavedResourceGraphQuery[]): boolean {
    try {
      window.localStorage.setItem(SAVED_RESOURCE_GRAPH_QUERIES_KEY, JSON.stringify(queries));
      return true;
    } catch (error) {
      console.error('Failed to save Resource Graph queries:', error);
      this.savedResourceGraphQueryError = error instanceof Error
        ? error.message
        : 'Resource Graph queries could not be saved to local storage.';
      return false;
    }
  }

  private isSavedQuery(value: unknown): value is SavedResourceGraphQuery {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const savedQuery = value as Record<string, unknown>;
    return typeof savedQuery['name'] === 'string'
      && typeof savedQuery['query'] === 'string';
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
          const nameParts = profile.displayName.trim().split(/\s+/);
          this.userName = nameParts.length > 2
            ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
            : profile.displayName.trim();
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
