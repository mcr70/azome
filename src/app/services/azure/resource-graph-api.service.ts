import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';

export interface ResourceGraphQueryOptions {
  apiVersion?: string;
  viaProxy?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ResourceGraphApiService {
  constructor(private readonly http: HttpClient) {}

  public query<T>(
    body: unknown,
    options: ResourceGraphQueryOptions = {}
  ): Observable<T> {
    const apiVersion = options.apiVersion ?? '2021-03-01';
    const endpoint = options.viaProxy
      ? `${environment.azure.proxyUrl}/governance-proxy/providers/Microsoft.ResourceGraph/resources`
      : `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources`;
    const params = new HttpParams().set('api-version', apiVersion);

    return this.http.post<T>(endpoint, body, { params });
  }
}