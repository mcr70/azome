import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';

export interface ArmRequestOptions {
  params?: HttpParams | Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ArmApiService {
  constructor(private readonly http: HttpClient) {}

  public get<T>(path: string, options: ArmRequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.armUrl(path), options);
  }

  public post<T>(
    path: string,
    body: unknown,
    options: ArmRequestOptions = {}
  ): Observable<T> {
    return this.http.post<T>(this.armUrl(path), body, options);
  }

  public getViaProxy<T>(path: string, options: ArmRequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.proxyUrl(path), options);
  }

  public postViaProxy<T>(
    path: string,
    body: unknown,
    options: ArmRequestOptions = {}
  ): Observable<T> {
    return this.http.post<T>(this.proxyUrl(path), body, options);
  }

  private armUrl(path: string): string {
    return `${environment.azure.resourceManagerUrl}${path}`;
  }

  private proxyUrl(path: string): string {
    return `${environment.azure.proxyUrl}/governance-proxy${path}`;
  }
}