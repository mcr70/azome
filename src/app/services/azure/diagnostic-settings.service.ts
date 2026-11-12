import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, catchError, expand, from, map, mergeMap, of, reduce, switchMap } from 'rxjs';
import { environment } from '@environments/environment';
import { LocalStorageService } from '@services/azome/local-storage.service';
import { SessionStorageService } from '@services/azome/session-storage.service';
import { ArmApiService } from './arm-api.service';
import { ResourceGraphApiService } from './resource-graph-api.service';
import { AzureResource } from './resource-graph.service';
import {
  DiagnosticSetting,
  DiagnosticSettingProperties,
  DiagnosticSettingsResult,
  diagnosticDestinations
} from './diagnostic-settings.model';

interface ResourcePage {
  data: AzureResource[];
  $skipToken?: string;
}

export interface DiagnosticSettingsScanScope {
  resourceGroup?: string;
}

export type CachedDiagnosticSettings = DiagnosticSettingsResult;

interface DiagnosticSettingsCache extends CachedDiagnosticSettings {
  subscriptionId: string;
}

interface DiagnosticSettingsResponse {
  value: {
    id: string;
    name: string;
    properties: DiagnosticSettingProperties;
  }[];
}

@Injectable({ providedIn: 'root' })
export class DiagnosticSettingsService {
  private readonly unsupportedResources = new Set<string>();

  constructor(
    private readonly armApi: ArmApiService,
    private readonly resourceGraphApi: ResourceGraphApiService,
    private readonly localStorage: LocalStorageService,
    private readonly sessionStorage: SessionStorageService
  ) {
    this.loadUnsupportedCache();
  }

  /** Reads cached diagnostic settings without making an Azure request. */
  public getCachedDiagnosticSettings(): CachedDiagnosticSettings {
    const empty: CachedDiagnosticSettings = { settings: [], failures: [] };
    const cached = this.localStorage.getItem(this.cacheKey());
    if (!cached) {
      return empty;
    }

    try {
      const parsed = JSON.parse(cached) as DiagnosticSettingsCache;
      if (parsed.subscriptionId !== environment.azure.subscriptionId) {
        return empty;
      }
      return {
        settings: parsed.settings ?? [],
        failures: parsed.failures ?? []
      };
    } catch {
      this.localStorage.removeItem(this.cacheKey());
      return empty;
    }
  }

  /** Scans diagnostic settings in the subscription or one resource group and updates the cache. */
  public scanDiagnosticSettings(
    scope: DiagnosticSettingsScanScope = {}
  ): Observable<CachedDiagnosticSettings> {
    const initialResult: DiagnosticSettingsResult = { settings: [], failures: [] };
    return this.getSources(scope).pipe(
      switchMap((sources) => {
        // Filter out resources already known in this session to be unsupported
        const activeSources = sources.filter((source) => !this.unsupportedResources.has(source.id.toLowerCase()));
        
        return from(activeSources).pipe(
          mergeMap((source) => this.getForSource(source), 6),
          reduce((result, page) => ({
            settings: [...result.settings, ...page.settings],
            failures: [...result.failures, ...page.failures]
          }), initialResult)
        );
      }),
      map((result) => this.updateCache(result, scope))
    );
  }

  /** Queries Resource Graph for the sources included in the requested scan scope. */
  private getSources(scope: DiagnosticSettingsScanScope): Observable<AzureResource[]> {
    const fetchPage = (skipToken?: string): Observable<ResourcePage> => {
      return this.resourceGraphApi.query<ResourcePage>({
        subscriptions: [environment.azure.subscriptionId],
        query: `
          Resources
          ${scope.resourceGroup ? `| where resourceGroup =~ '${scope.resourceGroup.replace(/'/g, "''")}'` : ''}
          | project id, name, type, resourceGroup, location
          | order by id asc
        `,
        options: {
          resultFormat: 'objectArray',
          $top: 1000,
          ...(skipToken ? { $skipToken: skipToken } : {})
        }
      });
    };

    return fetchPage().pipe(
      expand((page) => page.$skipToken ? fetchPage(page.$skipToken) : EMPTY),
      reduce((sources, page) => [...sources, ...page.data], [] as AzureResource[]),
      map((resources) => {
        const sources = new Map(
          resources.map((resource) => [resource.id.toLowerCase(), resource])
        );
        
        const subscriptionId = `/subscriptions/${environment.azure.subscriptionId}`;
        if (!scope.resourceGroup && !sources.has(subscriptionId.toLowerCase())) {
          sources.set(subscriptionId.toLowerCase(), {
            id: subscriptionId,
            name: environment.azure.subscriptionId,
            type: 'Microsoft.Resources/subscriptions'
          });
        }

        // Storage resource logs are configured on service children, not just on the account.
        for (const resource of resources) {
          if (resource.type.toLowerCase() === 'microsoft.storage/storageaccounts') {
            for (const service of ['blobServices', 'fileServices', 'queueServices', 'tableServices']) {
              const id = `${resource.id}/${service}/default`;
              if (!sources.has(id.toLowerCase())) {
                sources.set(id.toLowerCase(), {
                  ...resource,
                  id,
                  name: `${resource.name}/${service}/default`,
                  type: `${resource.type}/${service}`
                });
              }
            }
          }
        }

        return Array.from(sources.values());
      })
    );
  }

  private updateCache(
    result: DiagnosticSettingsResult,
    scope: DiagnosticSettingsScanScope
  ): CachedDiagnosticSettings {
    const cached = this.getCachedDiagnosticSettings();
    const scopedGroup = scope.resourceGroup?.toLowerCase() ?? null;
    const failedSources = new Set(result.failures.map((failure) => failure.source.id.toLowerCase()));
    const retained = cached.settings.filter((setting) => {
      const inScope = scopedGroup === null
        || setting.resourceGroup?.toLowerCase() === scopedGroup;
      return !inScope || failedSources.has(setting.source.id.toLowerCase());
    });
    const settings = [...retained, ...result.settings]
      .filter((setting, index, all) => all.findIndex((item) => item.id.toLowerCase()
        === setting.id.toLowerCase()) === index)
      .sort((a, b) => a.source.name.localeCompare(b.source.name) || a.name.localeCompare(b.name));
    const failures = [
      ...cached.failures.filter((failure) => scope.resourceGroup
        && failure.source.resourceGroup?.toLowerCase() !== scopedGroup),
      ...result.failures
    ];

    const cache: DiagnosticSettingsCache = {
      subscriptionId: environment.azure.subscriptionId,
      settings,
      failures
    };
    this.localStorage.setItem(this.cacheKey(), JSON.stringify(cache));
    return {
      settings: cache.settings,
      failures: cache.failures
    };
  }

  private loadUnsupportedCache(): void {
    const cached = this.sessionStorage.getItem(this.sessionCacheKey());
    if (!cached) {
      return;
    }

    try {
      const ids = JSON.parse(cached) as string[];
      if (Array.isArray(ids)) {
        for (const id of ids) {
          this.unsupportedResources.add(id.toLowerCase());
        }
      }
    } catch {
      this.sessionStorage.removeItem(this.sessionCacheKey());
    }
  }

  private saveUnsupportedCache(): void {
    this.sessionStorage.setItem(
      this.sessionCacheKey(),
      JSON.stringify(Array.from(this.unsupportedResources))
    );
  }

  private cacheKey(): string {
    return `azome:diagnostic-settings:${environment.azure.subscriptionId}`;
  }

  private sessionCacheKey(): string {
    return `azome:unsupported-diagnostic-resources:${environment.azure.subscriptionId}`;
  }

  private getForSource(source: AzureResource): Observable<DiagnosticSettingsResult> {
    const path = `${source.id}/providers/Microsoft.Insights/diagnosticSettings`;
    return this.armApi.get<DiagnosticSettingsResponse>(path, {
      params: { 'api-version': '2021-05-01-preview' }
    }).pipe(
      map((response) => ({
        settings: response.value.map((setting): DiagnosticSetting => ({
          ...setting,
          type: 'Microsoft.Insights/diagnosticSettings',
          resourceGroup: source.resourceGroup,
          location: source.location,
          source,
          destinations: diagnosticDestinations(setting.properties)
        })),
        failures: []
      })),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 400) {
          const errObj = error.error as { error?: { code?: string }; code?: string } | null;
          const errorCode = errObj?.error?.code ?? errObj?.code;
          
          if (errorCode && ['DiagnosticSettingsNotSupported', 'ResourceTypeNotSupported'].includes(errorCode)) {
            // Resource does not support diagnostic settings -> mark as unsupported for this session
            this.unsupportedResources.add(source.id.toLowerCase());
            this.saveUnsupportedCache();
            return of({ settings: [], failures: [] });
          }
        }

        // The failures list will contain the error for this resource, but it will not be added to the unsupported list.
        // It will be retried on the next attempt. (429, 500, etc.)
        console.error('Failed to load diagnostic settings for resource:', source.id, error);
        const message = error instanceof HttpErrorResponse
          ? `${error.status}: ${error.error?.error?.message ?? error.error?.message ?? error.message}`
          : 'Unexpected error while loading diagnostic settings.';
        return of({ settings: [], failures: [{ source, message }] });
      })
    );
  }
}