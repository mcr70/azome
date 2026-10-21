import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '@environments/environment';

export interface LogAnalyticsTable {
  name: string;
  columns: { name: string; type: string }[];
  rows: unknown[][];
}

export interface LogAnalyticsQueryResult {
  tables: LogAnalyticsTable[];
  error?: { code?: string; message?: string };
}

export interface LogAnalyticsSchemaTable {
  name: string;
  columns: { name: string; type: string }[];
}

@Injectable({ providedIn: 'root' })
export class LogAnalyticsService {
  constructor(private http: HttpClient) {}

  getTables(workspaceId: string): Observable<LogAnalyticsSchemaTable[]> {
    return this.http.get<{ tables?: LogAnalyticsSchemaTable[] }>(
      `${this.workspaceUrl(workspaceId)}/metadata`
    ).pipe(map((response) => [...(response.tables ?? [])].sort((first, second) =>
      first.name.localeCompare(second.name)
    )));
  }

  query(workspaceId: string, query: string, timespan: string): Observable<LogAnalyticsQueryResult> {
    return this.http.post<LogAnalyticsQueryResult>(`${this.workspaceUrl(workspaceId)}/query`, {
      query,
      timespan
    }, { headers: { Prefer: 'wait=60' }, timeout: 90000 });
  }

  getActiveTableNames(workspaceId: string): Observable<string[]> {
    const query = 'Usage\n| where StartTime >= ago(30d)\n| where Quantity > 0\n| distinct DataType';
    return this.query(workspaceId, query, 'P31D').pipe(map((response) => {
      if (response.error) {
        throw new Error(response.error.message ?? 'Table activity results are incomplete.');
      }
      const table = response.tables.find((result) =>
        result.columns.some((column) => column.name === 'DataType')
      );
      if (!table) {
        throw new Error('Table activity response is missing DataType.');
      }
      const columnIndex = table.columns.findIndex((column) => column.name === 'DataType');
      return table.rows.map((row) => row[columnIndex]).filter((name): name is string =>
        typeof name === 'string' && name.length > 0
      );
    }));
  }

  private workspaceUrl(workspaceId: string): string {
    return `${environment.azure.proxyUrl}/log-analytics-proxy/v1/workspaces/`
      + encodeURIComponent(workspaceId);
  }
}