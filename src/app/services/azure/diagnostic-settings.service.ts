import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, catchError, expand, from, map, mergeMap, of, reduce, switchMap } from 'rxjs';
import { environment } from '@environments/environment';
import { LocalStorageService } from '@services/azome/local-storage.service';
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

export interface CachedDiagnosticSettings extends DiagnosticSettingsResult {
  scannedAt: string | null;
  scopes: { resourceGroup: string | null; scannedAt: string }[];
}

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

const unsupportedDiagnosticSourceTypes = new Set([
  'microsoft.resources/subscriptions/resourcegroups',
  'microsoft.network/networkwatchers',
  'microsoft.network/routetables'
]);

@Injectable({ providedIn: 'root' })
export class DiagnosticSettingsService {
  constructor(
    private readonly armApi: ArmApiService,
    private readonly resourceGraphApi: ResourceGraphApiService,
    private readonly localStorage: LocalStorageService
  ) {
  }

  /** Reads cached diagnostic settings without making an Azure request. */
  public getCachedDiagnosticSettings(): CachedDiagnosticSettings {
    const empty: CachedDiagnosticSettings = { settings: [], failures: [], scannedAt: null, scopes: [] };
    const cached = this.localStorage.getItem(this.cacheKey());
    if (!cached) {
      return empty;
    }

    try {
      const parsed = JSON.parse(cached) as DiagnosticSettingsCache;
      if (parsed.subscriptionId !== environment.azure.subscriptionId) {
        return empty;
      }
      const scopesByResourceGroup = new Map<string, CachedDiagnosticSettings['scopes'][number]>();
      for (const scope of parsed.scopes ?? []) {
        const key = scope.resourceGroup?.toLowerCase() ?? '';
        const current = scopesByResourceGroup.get(key);
        if (!current || current.scannedAt < scope.scannedAt) {
          scopesByResourceGroup.set(key, scope);
        }
      }
      return {
        settings: parsed.settings ?? [],
        failures: parsed.failures ?? [],
        scannedAt: parsed.scannedAt ?? null,
        scopes: Array.from(scopesByResourceGroup.values())
      };
    } catch {
      this.localStorage.removeItem(this.cacheKey());
      return empty;
    }
  }

  /** Scans diagnostic settings in the subscription or one resource group and updates the cache.
   *
   * @param scope Optional resource-group scope; omitted to scan the subscription.
   * @returns The merged cache state after the scan.
   */
  public scanDiagnosticSettings(
    scope: DiagnosticSettingsScanScope = {}
  ): Observable<CachedDiagnosticSettings> {
    const initialResult: DiagnosticSettingsResult = { settings: [], failures: [] };
    return this.getSources(scope).pipe(
      switchMap((sources) => from(sources).pipe(
        mergeMap((source) => this.getForSource(source), 6),
        reduce((result, page) => ({
          settings: [...result.settings, ...page.settings],
          failures: [...result.failures, ...page.failures]
        }), initialResult)
      )),
      map((result) => this.updateCache(result, scope))
    );
  }

  /** Queries Resource Graph for the sources included in the requested scan scope.
   *
   * @param scope Scan scope.
   * @returns Diagnostic setting sources to query through ARM.
   */
  private getSources(scope: DiagnosticSettingsScanScope): Observable<AzureResource[]> {
    const fetchPage = (skipToken?: string): Observable<ResourcePage> => {
      return this.resourceGraphApi.query<ResourcePage>({
        subscriptions: [environment.azure.subscriptionId],
        query: `
          Resources
          ${scope.resourceGroup ? `| where resourceGroup =~ '${scope.resourceGroup.replace(/'/g, "''")}'` : ''}
          | where type !in~ (${Array.from(unsupportedDiagnosticSourceTypes, (type) => `'${type}'`).join(', ')})
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
          resources
            .filter((resource) => !unsupportedDiagnosticSourceTypes.has(resource.type.toLowerCase()))
            .map((resource) => [resource.id.toLowerCase(), resource])
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

  /** Replaces scanned-scope entries and retains failed-source or out-of-scope entries.
   *
   * @param result Results from the completed ARM requests.
   * @param scope Scope that was scanned.
   * @returns Merged settings and cache metadata.
   */
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
    const scannedAt = new Date().toISOString();
    const scopes = [
      ...cached.scopes.filter((item) =>
        (item.resourceGroup?.toLowerCase() ?? null) !== scopedGroup
      ),
      { resourceGroup: scope.resourceGroup ?? null, scannedAt }
    ];
    const failures = [
      ...cached.failures.filter((failure) => scope.resourceGroup
        && failure.source.resourceGroup?.toLowerCase() !== scopedGroup),
      ...result.failures
    ];
    const completeSubscriptionScan = !scope.resourceGroup;
    const cache: DiagnosticSettingsCache = {
      subscriptionId: environment.azure.subscriptionId,
      settings,
      failures,
      scannedAt: completeSubscriptionScan ? scannedAt : cached.scannedAt,
      scopes
    };
    this.localStorage.setItem(this.cacheKey(), JSON.stringify(cache));
    return {
      settings: cache.settings,
      failures: cache.failures,
      scannedAt: cache.scannedAt,
      scopes: cache.scopes
    };
  }

  /** Builds a local-storage key scoped to the configured subscription.
   *
   * @returns Cache key.
   */
  private cacheKey(): string {
    return `azome:diagnostic-settings:${environment.azure.subscriptionId}`;
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
        if (error instanceof HttpErrorResponse && error.status === 400
          && ['DiagnosticSettingsNotSupported', 'ResourceTypeNotSupported']
            .includes(error.error?.error?.code)) {
          return of({ settings: [], failures: [] });
        }

        console.error('Failed to load diagnostic settings for resource:', source.id, error);
        const message = error instanceof HttpErrorResponse
          ? `${error.status}: ${error.error?.error?.message ?? error.message}`
          : 'Unexpected error while loading diagnostic settings.';
        return of({ settings: [], failures: [{ source, message }] });
      })
    );
  }
}
