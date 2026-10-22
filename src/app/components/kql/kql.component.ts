import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown,
  LucideDynamicIcon,
  LucidePlay,
  LucideRefreshCw,
  LucideSave,
  LucideSquare,
  LucideX
} from '@lucide/angular';
import { QueryEditorComponent } from '@components/query-editor/query-editor.component';
import type { QueryEditorExtensions } from '@components/query-editor/query-editor.component';
import { kqlEditorExtensions } from '@components/query-editor/kql';
import type { KqlCompletionSchema } from '@components/query-editor/kql';
import { Subscription, catchError, finalize, forkJoin, of } from 'rxjs';
import {
  LogAnalyticsSchemaTable,
  LogAnalyticsService,
  LogAnalyticsTable
} from '@services/azure/log-analytics.service';

const SAVED_KQL_QUERIES_KEY = 'azome.savedKqlQueries';
const RESULTS_PAGE_SIZE = 50;

interface SavedKqlQuery {
  name: string;
  query: string;
}

@Component({
  selector: 'app-kql',
  standalone: true,
  imports: [FormsModule, LucideDynamicIcon, QueryEditorComponent],
  templateUrl: './kql.component.html',
  styleUrl: './kql.component.scss'
})
export class KqlComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) workspaceId = '';
  @Input() workspaceName = '';
  @Output() close = new EventEmitter<void>();
  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild(QueryEditorComponent) private queryEditor?: QueryEditorComponent;
  @ViewChild('savedQueriesMenu') private savedQueriesMenu?: ElementRef<HTMLDetailsElement>;
  @ViewChild('sourceTablesPanel') private sourceTablesPanel?: ElementRef<HTMLDetailsElement>;

  public readonly playIcon = LucidePlay.icon;
  public readonly stopIcon = LucideSquare.icon;
  public readonly closeIcon = LucideX.icon;
  public readonly saveIcon = LucideSave.icon;
  public readonly chevronIcon = LucideChevronDown.icon;
  public readonly rescanIcon = LucideRefreshCw.icon;
  public editorExtensions: QueryEditorExtensions = this.createEditorExtensions([]);
  public savedQueries: SavedKqlQuery[] = [];
  public selectedSavedQueryName = '';
  public queryName = '';
  public savedQueryError: string | null = null;
  public query = '';
  public timespan = 'P1D';
  public tableFilter = '';
  public tables: LogAnalyticsSchemaTable[] = [];
  public selectedTable: LogAnalyticsSchemaTable | null = null;
  public sourceTables: LogAnalyticsSchemaTable[] = [];
  public sourceScanDurationMs: number | null = null;
  public tableScope: 'recent' | 'all' = 'recent';
  public activeTableNames: Set<string> | null = null;
  public activityError: string | null = null;
  public results: LogAnalyticsTable[] | null = null;
  public tablesLoading = false;
  public loading = false;
  public tablesError: string | null = null;
  public queryError: string | null = null;

  private tablesSubscription?: Subscription;
  private querySubscription?: Subscription;
  private readonly resultPages = new Map<number, number>();

  constructor(private logAnalytics: LogAnalyticsService) {
    this.loadSavedQueries();
  }

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
    this.queryEditor?.focus();
  }

  ngOnChanges(): void {
    this.cancelQuery();
    this.tablesSubscription?.unsubscribe();
    this.tables = [];
    this.selectedTable = null;
    this.resetSourceTables();
    this.tableScope = 'recent';
    this.activeTableNames = null;
    this.activityError = null;
    this.results = null;
    this.query = '';
    this.queryName = '';
    this.selectedSavedQueryName = '';
    this.tableFilter = '';
    this.queryError = null;
    this.tablesError = null;
    if (this.workspaceId) {
      this.loadTables();
    }
  }

  ngOnDestroy(): void {
    this.tablesSubscription?.unsubscribe();
    this.querySubscription?.unsubscribe();
    this.dialog?.nativeElement.close();
  }

  public get filteredTables(): LogAnalyticsSchemaTable[] {
    const filter = this.tableFilter.trim().toLowerCase();
    return this.tables.filter((table) =>
      table.name.toLowerCase().includes(filter)
      && (this.tableScope === 'all' || this.activeTableNames?.has(table.name))
    );
  }

  public loadTables(): void {
    this.tablesSubscription?.unsubscribe();
    this.resetSourceTables();
    this.tablesLoading = true;
    this.tablesError = null;
    this.activityError = null;
    this.tablesSubscription = forkJoin({
      tables: this.logAnalytics.getTables(this.workspaceId),
      activeNames: this.logAnalytics.getActiveTableNames(this.workspaceId).pipe(
        catchError((error: unknown) => {
          this.activityError = this.errorMessage(error);
          this.tableScope = 'all';
          return of(null);
        })
      )
    }).pipe(
      finalize(() => this.tablesLoading = false)
    ).subscribe({
      next: ({ tables, activeNames }) => {
        this.tables = tables;
        this.editorExtensions = this.createEditorExtensions(tables);
        this.activeTableNames = activeNames === null ? null : new Set(activeNames);
        if (this.sourceTablesPanel?.nativeElement.open) {
          this.scanSourceTables();
        }
      },
      error: (error: unknown) => this.tablesError = this.errorMessage(error)
    });
  }

  public selectTable(table: LogAnalyticsSchemaTable): void {
    this.resetSourceTables();
    this.selectedTable = table;
    this.selectedSavedQueryName = '';
    this.queryName = '';
    const hasCategory = table.columns.some((column) => column.name === 'Category');
    this.query = hasCategory
      ? `${table.name}\n| summarize Count = count() by Category\n| order by Count desc`
      : `${table.name}\n| take 10`;
  }

  public onSourceTablesToggle(open: boolean): void {
    if (open && this.sourceScanDurationMs === null && !this.tablesLoading && !this.tablesError) {
      this.scanSourceTables();
    }
  }

  /**
   * Creates editor extensions for highlighting and completion based on the workspace schema.
   * @param tables Tables of the workspace with their columns
   */
  private createEditorExtensions(tables: LogAnalyticsSchemaTable[]): QueryEditorExtensions {
    const schema: KqlCompletionSchema = {
      tables: tables.map((table) => ({
        name: table.name,
        columns: table.columns.map((column) => column.name)
      }))
    };
    return kqlEditorExtensions(() => schema);
  }

  public scanSourceTables(): void {
    const started = performance.now();
    const names = new Set(this.query.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
    this.sourceTables = this.tables.filter((table) => names.has(table.name));
    this.sourceScanDurationMs = performance.now() - started;
  }

  public saveQuery(): void {
    const name = this.queryName.trim();
    const query = this.query.trim();
    if (!name || !query) {
      return;
    }
    const index = this.savedQueries.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    const queries = [...this.savedQueries];
    if (index >= 0) {
      queries[index] = { name, query };
    } else {
      queries.push({ name, query });
    }
    if (this.persistSavedQueries(queries)) {
      this.savedQueries = queries;
      this.selectedSavedQueryName = name;
      this.queryName = name;
    }
  }

  public selectSavedQuery(savedQuery: SavedKqlQuery): void {
    if (this.loading) {
      return;
    }
    this.resetSourceTables();
    this.query = savedQuery.query;
    this.queryName = savedQuery.name;
    this.selectedSavedQueryName = savedQuery.name;
    this.selectedTable = null;
    this.results = null;
    this.queryError = null;
    if (this.savedQueriesMenu) {
      this.savedQueriesMenu.nativeElement.open = false;
      this.savedQueriesMenu.nativeElement.querySelector('summary')?.focus();
    }
  }

  public deleteSavedQuery(name: string): void {
    const queries = this.savedQueries.filter((item) => item.name !== name);
    if (this.persistSavedQueries(queries)) {
      this.savedQueries = queries;
      if (this.selectedSavedQueryName === name) {
        this.selectedSavedQueryName = '';
        this.queryName = '';
      }
    }
  }

  @HostListener('document:click', ['$event'])
  public closeSavedQueriesOnOutsideClick(event: MouseEvent): void {
    const menu = this.savedQueriesMenu?.nativeElement;
    if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
      menu.open = false;
    }
  }

  public runQuery(): void {
    const query = this.query.trim();
    if (!query || !this.workspaceId || this.loading) {
      return;
    }
    this.results = null;
    this.resultPages.clear();
    this.queryError = null;
    this.loading = true;
    this.querySubscription = this.logAnalytics.query(this.workspaceId, query, this.timespan).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: (response) => {
        this.results = response.tables;
        this.queryError = response.error
          ? `Partial results: ${this.errorMessage(response.error)}`
          : null;
      },
      error: (error: unknown) => this.queryError = this.errorMessage(error)
    });
  }

  public cancelQuery(): void {
    this.querySubscription?.unsubscribe();
    this.loading = false;
  }

  public runOrStopQuery(): void {
    if (this.loading) {
      this.cancelQuery();
      return;
    }
    this.runQuery();
  }

  public getPageCount(table: LogAnalyticsTable): number {
    return Math.max(1, Math.ceil(table.rows.length / RESULTS_PAGE_SIZE));
  }

  public getCurrentPage(tableIndex: number): number {
    return this.resultPages.get(tableIndex) ?? 0;
  }

  public getPageRows(table: LogAnalyticsTable, tableIndex: number): unknown[][] {
    const start = this.getCurrentPage(tableIndex) * RESULTS_PAGE_SIZE;
    return table.rows.slice(start, start + RESULTS_PAGE_SIZE);
  }

  public goToPage(table: LogAnalyticsTable, tableIndex: number, page: number): void {
    const lastPage = this.getPageCount(table) - 1;
    this.resultPages.set(tableIndex, Math.min(Math.max(page, 0), lastPage));
  }

  public formatCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  private resetSourceTables(): void {
    this.sourceTables = [];
    this.sourceScanDurationMs = null;
    if (this.sourceTablesPanel) {
      this.sourceTablesPanel.nativeElement.open = false;
    }
  }

  private loadSavedQueries(): void {
    try {
      const storedValue = localStorage.getItem(SAVED_KQL_QUERIES_KEY);
      if (!storedValue) {
        return;
      }
      const parsed: unknown = JSON.parse(storedValue);
      if (!Array.isArray(parsed) || !parsed.every((item): item is SavedKqlQuery =>
        item !== null && typeof item === 'object'
        && typeof item.name === 'string' && item.name.trim().length > 0
        && typeof item.query === 'string' && item.query.trim().length > 0
      )) {
        throw new Error('Saved KQL queries have an invalid format.');
      }
      this.savedQueries = parsed;
    } catch {
      this.savedQueryError = 'Saved queries could not be loaded from local storage.';
    }
  }

  private persistSavedQueries(queries: SavedKqlQuery[]): boolean {
    try {
      localStorage.setItem(SAVED_KQL_QUERIES_KEY, JSON.stringify(queries));
      this.savedQueryError = null;
      return true;
    } catch {
      this.savedQueryError = 'Saved queries could not be written to local storage.';
      return false;
    }
  }

  private errorMessage(error: unknown): string {
    let body: unknown = error instanceof HttpErrorResponse ? error.error : error;
    if (typeof body === 'string') {
      const text = body.trim();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const messages: string[] = [];
    const seenMessages = new Set<string>();
    const visited = new Set<object>();
    const identifiers = new Map<string, string>();
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        const message = value.trim();
        if (message && !seenMessages.has(message)) {
          seenMessages.add(message);
          messages.push(message);
        }
        return;
      }
      if (!value || typeof value !== 'object' || visited.has(value)) {
        return;
      }
      visited.add(value);
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const details = value as Record<string, unknown>;
      for (const key of ['innererror', 'innerError', 'details', 'errors', 'error']) {
        visit(details[key]);
      }
      const message = typeof details['message'] === 'string' ? details['message'].trim() : '';
      const code = typeof details['code'] === 'string' ? details['code'].trim() : '';
      const identity = message || code;
      if (identity && !seenMessages.has(identity)) {
        seenMessages.add(identity);
        messages.push(code && message ? `${code}: ${message}` : identity);
      }
      for (const [key, label] of [['correlationId', 'Correlation ID'], ['requestId', 'Request ID']]) {
        if (typeof details[key] === 'string' && details[key]) {
          identifiers.set(label, details[key]);
        }
      }
    };
    visit(body);

    if (messages.length === 0) {
      messages.push(error instanceof Error ? error.message : 'Log Analytics request failed.');
    }
    if (error instanceof HttpErrorResponse) {
      messages.push(error.status === 0 ? 'Network request failed.' : `HTTP ${error.status}`);
      const requestId = error.headers.get('x-ms-request-id');
      const correlationId = error.headers.get('x-ms-correlation-request-id');
      if (requestId) {
        identifiers.set('Request ID', requestId);
      }
      if (correlationId) {
        identifiers.set('Correlation ID', correlationId);
      }
    }
    for (const [label, value] of identifiers) {
      messages.push(`${label}: ${value}`);
    }
    return messages.join('\n');
  }
}