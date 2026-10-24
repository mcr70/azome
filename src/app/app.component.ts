import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from './services/azome/auth.service';
import { ProfileService } from './services/azure/profile.service';
import {
  ResourceGraphQueryResult,
  ResourceGraphService
} from './services/azure/resource-graph.service';
import { PreferencesComponent } from './components/preferences/preferences.component';
import { QueryEditorComponent } from './components/query-editor/query-editor.component';
import { PolicySetDetailsDialogComponent } from './components/resources/policy/policy-set-details-dialog.component';
import {
  collectDynamicPaths,
  kqlEditorExtensions,
  RESOURCE_GRAPH_COLUMNS,
  RESOURCE_GRAPH_TABLES
} from './components/query-editor/kql';
import {
  DEFAULT_PERSPECTIVES,
  PerspectivePreference
} from './components/preferences/perspective-preference.model';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from './services/azome/resource-selection.service';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const ACTIVE_ROUTE_KEY = 'azome.activeRoute';
const SAVED_RESOURCE_GRAPH_QUERIES_KEY = 'azome.savedResourceGraphQueries';
const PERSPECTIVE_PREFERENCES_KEY = 'azome.perspectivePreferences';
const PERSPECTIVE_ROUTES: Record<string, string> = {
  '/rg': 'resources',
  '/networking': 'networking',
  '/monitoring': 'monitoring',
  '/data': 'data',
  '/app': 'app',
  // Route mapping keeps the toolbar selection synchronized with governance navigation.
  '/governance': 'governance'
};

interface SavedResourceGraphQuery {
  name: string;
  query: string;
}

function getResourceGraphErrorDetails(error: unknown): string[] {
  if (!error || typeof error !== 'object' || !('error' in error)) {
    return [];
  }

  const responseBody = error.error;
  if (!responseBody || typeof responseBody !== 'object') {
    return [];
  }

  const graphError = 'error' in responseBody && responseBody.error
    && typeof responseBody.error === 'object'
    ? responseBody.error
    : responseBody;
  if (!('details' in graphError) || !Array.isArray(graphError.details)) {
    return [];
  }

  return graphError.details
    .filter((detail): detail is { message: string } =>
      !!detail
      && typeof detail === 'object'
      && 'message' in detail
      && typeof detail.message === 'string'
      && detail.message.trim().length > 0
    )
    .map((detail) => "- " + detail.message.trim());
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterOutlet,
    PreferencesComponent,
    QueryEditorComponent,
    PolicySetDetailsDialogComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('perspectiveMenu') private perspectiveMenu?: ElementRef<HTMLDetailsElement>;
  @ViewChild('toolsMenu') private toolsMenu?: ElementRef<HTMLDetailsElement>;
  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLDetailsElement>;

  public userName: string | null = null;
  public selectedPerspective = 'resources';
  public perspectives = DEFAULT_PERSPECTIVES.map((preference) => ({ ...preference }));
  public preferencesDialogOpen = false;
  public preferencesError: string | null = null;
  public resourceGraphDialogOpen = false;
  public resourceGraphQuery = 'Resources | limit 10';
  public readonly resourceGraphTables = RESOURCE_GRAPH_TABLES;

  /** Paths inside dynamic columns (properties, tags, ...) learned from query results. */
  private readonly resourceGraphDynamicPaths = new Set<string>();
  public readonly resourceGraphEditorExtensions = kqlEditorExtensions(() => ({
    tables: RESOURCE_GRAPH_TABLES.map((name) => ({ name, columns: RESOURCE_GRAPH_COLUMNS })),
    ignoreCase: true,
    dynamicPaths: this.resourceGraphDynamicPaths
  }));
  public resourceGraphQueryLoading = false;
  public resourceGraphQueryError: string | null = null;
  public resourceGraphResults: unknown[] | null = null;
  public resourceGraphQueryResult: ResourceGraphQueryResult | null = null;
  public resourceGraphVisibleColumns: string[] = [];
  public readonly expandedResourceGraphRows = new Set<number>();
  public savedResourceGraphQueries: SavedResourceGraphQuery[] = [];
  public selectedSavedResourceGraphQueryName = '';
  public resourceGraphQueryName = '';
  public savedResourceGraphQueryError: string | null = null;
  private readonly destroy$ = new Subject<void>();
  private resourceGraphQuerySubscription: Subscription | null = null;

  public get visiblePerspectives(): PerspectivePreference[] {
    return this.perspectives.filter((perspective) => perspective.visible);
  }

  constructor(
    public auth: AuthService,
    private azure: ProfileService,
    private resourceGraph: ResourceGraphService,
    private router: Router,
    public resourceSelection: ResourceSelectionService
  ) {}

  ngOnInit(): void {
    this.loadSavedResourceGraphQueries();
    this.loadPerspectivePreferences();

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
          if (!this.isPerspectiveVisible(perspectiveRoute.perspective)) {
            this.navigateToFirstVisiblePerspective();
            return;
          }
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
          this.closePreferencesDialog();
        }
      });
  }

  public changePerspective(perspectiveId: string, menu: HTMLDetailsElement): void {
    menu.open = false;
    const selectedPreference = this.perspectives.find((item) => item.id === perspectiveId);
    if (!selectedPreference?.visible) {
      return;
    }

    this.selectedPerspective = selectedPreference.id;
    this.router.navigateByUrl(selectedPreference.route);
  }

  public openPreferencesDialog(userMenu: HTMLDetailsElement): void {
    userMenu.open = false;
    this.closeResourceGraphDialog();
    this.preferencesDialogOpen = true;
  }

  public closePreferencesDialog(): void {
    this.preferencesDialogOpen = false;
  }

  public updatePerspectivePreferences(preferences: PerspectivePreference[]): void {
    this.perspectives = preferences;

    try {
      window.localStorage.setItem(PERSPECTIVE_PREFERENCES_KEY, JSON.stringify(preferences));
      this.preferencesError = null;
    } catch (error) {
      console.error('Failed to save perspective preferences:', error);
      this.preferencesError = error instanceof Error
        ? error.message
        : 'Perspective preferences could not be saved to local storage.';
    }

    if (!this.isPerspectiveVisible(this.selectedPerspective)) {
      this.navigateToFirstVisiblePerspective();
    }
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

  @HostListener('document:click', ['$event'])
  public closeMenusOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (
      this.perspectiveMenu
      && !this.perspectiveMenu.nativeElement.contains(target)
    ) {
      this.perspectiveMenu.nativeElement.open = false;
    }
    if (this.toolsMenu && !this.toolsMenu.nativeElement.contains(target)) {
      this.toolsMenu.nativeElement.open = false;
    }
    if (this.userMenu && !this.userMenu.nativeElement.contains(target)) {
      this.userMenu.nativeElement.open = false;
    }
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
    this.resourceGraphQueryResult = null;
    this.resourceGraphVisibleColumns = [];
    this.expandedResourceGraphRows.clear();
    this.resourceGraphQuerySubscription = this.resourceGraph.executeQuery(query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.resourceGraphQueryResult = result;
          this.resourceGraphResults = result.rows;
          const columns = result.columns.map((column) => column.name);
          const preferred = columns.length > 8
            && ['id', 'name', 'type'].every((name) => columns.includes(name))
            ? ['name', 'type', 'resourceGroup', 'location']
              .filter((name) => columns.includes(name))
            : [];
          const scalarColumns = result.columns
            .filter((column) => column.type !== 'dynamic' || result.rows.some((row) =>
              row[column.name] !== null && typeof row[column.name] !== 'object'
            ))
            .map((column) => column.name);
          this.resourceGraphVisibleColumns = columns.length <= 8
            ? columns
            : [...new Set([...preferred, ...scalarColumns, ...columns])].slice(0, 8);
          collectDynamicPaths(
            result.rows,
            this.resourceGraphDynamicPaths
          );
          this.resourceGraphQueryLoading = false;
          this.resourceGraphQuerySubscription = null;
        },
        error: (error: unknown) => {
          console.error('Failed to run Azure Resource Graph query:', error);
          const errorMessage = error instanceof Error
            ? error.message
            : 'The Resource Graph query failed. Check the query and permissions.';
          const errorDetails = getResourceGraphErrorDetails(error);
          this.resourceGraphQueryError = errorDetails.length > 0
            ? `${errorMessage}\n${errorDetails.join('\n')}`
            : errorMessage;
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

  public toggleResourceGraphColumn(name: string): void {
    if (this.resourceGraphVisibleColumns.includes(name)) {
      if (this.resourceGraphVisibleColumns.length === 1) {
        return;
      }
      this.resourceGraphVisibleColumns = this.resourceGraphVisibleColumns
        .filter((column) => column !== name);
    } else {
      this.resourceGraphVisibleColumns = [...this.resourceGraphVisibleColumns, name];
    }
  }

  public toggleResourceGraphRow(index: number): void {
    if (this.expandedResourceGraphRows.has(index)) {
      this.expandedResourceGraphRows.delete(index);
    } else {
      this.expandedResourceGraphRows.add(index);
    }
  }

  public resourceGraphCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '\u2014';
    }
    if (Array.isArray(value)) {
      return `${value.length} items`;
    }
    return typeof value === 'object' ? '{...}' : String(value);
  }

  public get hasSelectableResourceGraphResults(): boolean {
    return this.resourceGraphResults?.some((row) => this.toSelectedAzureResource(row) !== null) ?? false;
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

  private loadPerspectivePreferences(): void {
    try {
      const storedValue = window.localStorage.getItem(PERSPECTIVE_PREFERENCES_KEY);
      if (!storedValue) {
        return;
      }

      const parsedValue: unknown = JSON.parse(storedValue);
      if (!Array.isArray(parsedValue)) {
        throw new Error('Perspective preferences have an invalid format.');
      }

      const storedPreferences = new Map<string, boolean>();
      for (const item of parsedValue) {
        if (
          !item
          || typeof item !== 'object'
          || typeof (item as Record<string, unknown>)['id'] !== 'string'
          || typeof (item as Record<string, unknown>)['visible'] !== 'boolean'
        ) {
          throw new Error('Perspective preferences have an invalid format.');
        }

        const preference = item as { id: string; visible: boolean };
        if (storedPreferences.has(preference.id)) {
          throw new Error('Perspective preferences contain duplicate entries.');
        }
        storedPreferences.set(preference.id, preference.visible);
      }

      const orderedPreferences: PerspectivePreference[] = [];
      for (const preference of parsedValue as Array<{ id: string; visible: boolean }>) {
        const defaultPreference = DEFAULT_PERSPECTIVES.find((item) => item.id === preference.id);
        if (!defaultPreference) {
          continue;
        }
        orderedPreferences.push({
          ...defaultPreference,
          visible: preference.visible
        });
      }

      for (const preference of DEFAULT_PERSPECTIVES) {
        if (!storedPreferences.has(preference.id)) {
          orderedPreferences.push({ ...preference });
        }
      }

      if (orderedPreferences.every((preference) => !preference.visible)) {
        throw new Error('At least one perspective must remain visible.');
      }

      this.perspectives = orderedPreferences;
    } catch (error) {
      console.error('Failed to load perspective preferences:', error);
      this.preferencesError = error instanceof Error
        ? error.message
        : 'Perspective preferences could not be loaded from local storage.';
    }
  }

  private isPerspectiveVisible(perspectiveId: string): boolean {
    return this.perspectives.some(
      (preference) => preference.id === perspectiveId && preference.visible
    );
  }

  private navigateToFirstVisiblePerspective(): void {
    const firstVisible = this.visiblePerspectives[0];
    if (!firstVisible) {
      return;
    }

    this.selectedPerspective = firstVisible.id;
    this.router.navigateByUrl(firstVisible.route);
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

    const activePath = this.perspectiveRoute(currentPath)
      ? currentPath
      : browserPath;
    const activePerspective = this.perspectiveRoute(activePath);
    if (activePerspective) {
      if (!this.isPerspectiveVisible(activePerspective.perspective)) {
        this.navigateToFirstVisiblePerspective();
      }
      return;
    }

    const savedRoute = window.sessionStorage.getItem(ACTIVE_ROUTE_KEY);
    const savedPath = savedRoute?.split(/[?#]/)[0] ?? '';
    const savedPerspective = this.perspectiveRoute(savedPath);
    const route = savedRoute
      && savedPerspective
      && this.isPerspectiveVisible(savedPerspective.perspective)
      ? savedRoute
      : this.visiblePerspectives[0]?.route ?? '/rg';
    const perspective = this.perspectiveRoute(route.split(/[?#]/)[0]);
    this.selectedPerspective = perspective?.perspective ?? this.visiblePerspectives[0]?.id ?? 'resources';
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
