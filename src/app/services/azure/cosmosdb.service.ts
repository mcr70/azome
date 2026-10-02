import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

export interface CosmosResource<T> {
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
  id?: string;
  [key: string]: unknown;
}

interface CosmosFeed<T> {
  DocumentCollections?: T[];
  Databases?: T[];
  Documents?: T[];
  PartitionKeyRanges?: Array<{ id: string }>;
}

@Injectable({ providedIn: 'root' })
export class CosmosDbService {
  constructor(private readonly http: HttpClient) {}

  listDatabases(account: string): Observable<CosmosResource<unknown>[]> {
    return this.getFeed(account, 'dbs', 'Databases');
  }

  listContainers(account: string, database: string): Observable<CosmosResource<unknown>[]> {
    return this.getFeed(account, `dbs/${encodeURIComponent(database)}/colls`, 'DocumentCollections');
  }

  queryDocuments(
    account: string,
    database: string,
    container: string,
    mode: 'all' | 'partition' | 'id',
    value: string,
    partitionPath: string,
    limit: number
  ): Observable<CosmosResource<unknown>[]> {
    if (mode === 'all') {
      return this.scanDocuments(account, database, container, limit);
    }

    const parameters: Array<{ name: string; value: unknown }> = [];
    let query = `SELECT TOP ${limit} * FROM c`;
    if (mode === 'partition') {
      const property = partitionPath.split('/').filter(Boolean).join('/');
      query += ' WHERE c["' + property + '"] = @value';
      parameters.push({ name: '@value', value });
    } else if (mode === 'id') {
      query += ' WHERE c.id = @value';
      parameters.push({ name: '@value', value });
    }

    const path = `dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}/docs`;
    let headers = this.headers()
      .set('Content-Type', 'application/query+json')
      .set('x-ms-documentdb-isquery', 'true')
      .set('x-ms-documentdb-query-enablecrosspartition', 'true');
    if (mode === 'partition') {
      headers = headers.set('x-ms-documentdb-partitionkey', JSON.stringify([value]));
    }

    return this.http.post<CosmosFeed<CosmosResource<unknown>>>(this.url(account, path), {
      query,
      parameters
    }, {
      headers
    }).pipe(map((feed) => feed.Documents ?? []));
  }

  private scanDocuments(
    account: string,
    database: string,
    container: string,
    limit: number
  ): Observable<CosmosResource<unknown>[]> {
    const collectionPath = `dbs/${encodeURIComponent(database)}/colls/${encodeURIComponent(container)}`;
    return this.http.get<CosmosFeed<unknown>>(this.url(account, `${collectionPath}/pkranges`), {
      headers: this.headers()
    }).pipe(
      map((feed) => feed.PartitionKeyRanges ?? []),
      switchMap((ranges) => {
        if (ranges.length === 0) {
          return of([]);
        }

        const requests = ranges.map((range) => this.http.get<CosmosFeed<CosmosResource<unknown>>>(
          this.url(account, `${collectionPath}/docs`),
          {
            headers: this.headers()
              .set('x-ms-documentdb-partitionkeyrangeid', range.id)
              .set('x-ms-max-item-count', String(limit))
          }
        ).pipe(map((feed) => feed.Documents ?? [])));

        return forkJoin(requests).pipe(
          map((pages) => pages.flat().slice(0, limit))
        );
      })
    );
  }

  private getFeed(
    account: string,
    path: string,
    property: 'Databases' | 'DocumentCollections'
  ): Observable<CosmosResource<unknown>[]> {
    return this.http.get<CosmosFeed<CosmosResource<unknown>>>(this.url(account, path), {
      headers: this.headers()
    }).pipe(map((feed) => feed[property] ?? []));
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'x-ms-version': '2018-12-31',
      'x-ms-date': new Date().toUTCString()
    });
  }

  private url(account: string, path: string): string {
    return `/cosmos-proxy/${encodeURIComponent(account)}/${path}`;
  }

}
