import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpResponse
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@environments/environment';
import { ArmApiService } from './arm-api.service';

type StorageService = 'blob' | 'file' | 'queue' | 'table';

interface ServiceSasResponse {
  serviceSasToken?: string;
}

interface AccountSasResponse {
  accountSasToken?: string;
}

@Injectable({ providedIn: 'root' })
export class StorageDataApiService {
  private readonly apiVersion = '2023-01-01';

  constructor(
    private readonly http: HttpClient,
    private readonly armApi: ArmApiService
  ) {}

  public getServiceSas(
    resourceId: string,
    service: 'blob' | 'file',
    resourceName: string
  ): Observable<string> {
    const account = this.accountName(resourceId);
    const signedResource = service === 'blob' ? 'c' : 's';
    const canonicalizedResource = `/${service}/${account}/${resourceName}`;
    const path = `${resourceId.replace(/\/$/, '')}/listServiceSas`;

    return this.armApi.post<ServiceSasResponse>(path, {
      canonicalizedResource,
      signedResource,
      signedPermission: 'rl',
      signedProtocol: 'https',
      signedExpiry: this.signedExpiry()
    }, {
      params: { 'api-version': this.apiVersion }
    }).pipe(map((response) => this.requireToken(response.serviceSasToken)));
  }

  public getAccountSas(
    resourceId: string,
    service: 'queue' | 'table'
  ): Observable<string> {
    const signedServices = service === 'queue' ? 'q' : 't';
    const path = `${resourceId.replace(/\/$/, '')}/listAccountSas`;

    return this.armApi.post<AccountSasResponse>(path, {
      signedServices,
      signedResourceTypes: 'sco',
      signedPermission: 'r',
      signedProtocol: 'https',
      signedStart: new Date(Date.now() - 300_000).toISOString(),
      signedExpiry: this.signedExpiry(),
      keyToSign: 'key1'
    }, {
      params: { 'api-version': this.apiVersion }
    }).pipe(map((response) => this.requireToken(response.accountSasToken)));
  }

  public getJson<T>(
    account: string,
    service: StorageService,
    path: string,
    params: HttpParams,
    headers: HttpHeaders | Record<string, string>
  ): Observable<T> {
    return this.http.get<T>(this.dataUrl(account, service, path), { params, headers });
  }

  public getBlob(
    account: string,
    service: StorageService,
    path: string,
    params: HttpParams,
    headers: HttpHeaders | Record<string, string>
  ): Observable<Blob> {
    return this.http.get(this.dataUrl(account, service, path), {
      params,
      headers,
      responseType: 'blob'
    });
  }

  public getText(
    account: string,
    service: StorageService,
    path: string,
    params: HttpParams,
    headers: HttpHeaders | Record<string, string>
  ): Observable<string> {
    return this.http.get(this.dataUrl(account, service, path), {
      params,
      headers,
      responseType: 'text'
    });
  }

  public getTextResponse(
    account: string,
    service: StorageService,
    path: string,
    params: HttpParams,
    headers: HttpHeaders | Record<string, string>
  ): Observable<HttpResponse<string>> {
    return this.http.get(this.dataUrl(account, service, path), {
      params,
      headers,
      observe: 'response',
      responseType: 'text'
    });
  }

  private accountName(resourceId: string): string {
    const account = resourceId.split('/').filter(Boolean).at(-1);
    if (!account) {
      throw new Error('Could not determine the Storage Account name from its ARM resource ID.');
    }
    return account;
  }

  private dataUrl(account: string, service: StorageService, path: string): string {
    return `${environment.azure.proxyUrl}/storage-proxy/${account}/${service}${path}`;
  }

  private signedExpiry(): string {
    return new Date(Date.now() + 5 * 60_000).toISOString();
  }

  private requireToken(token: string | undefined): string {
    if (!token) {
      throw new Error('Azure Resource Manager did not return a Storage SAS token.');
    }
    return token.replace(/^\?/, '');
  }
}