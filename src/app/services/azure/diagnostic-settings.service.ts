import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, catchError, expand, from, map, mergeMap, of, reduce, switchMap } from 'rxjs';
import { environment } from '@environments/environment';
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
  constructor(private readonly http: HttpClient) {
  }

  public getDiagnosticSettings(): Observable<DiagnosticSettingsResult> {
    const initialResult: DiagnosticSettingsResult = { settings: [], failures: [] };
    return this.getSources().pipe(
      switchMap((sources) => from(sources).pipe(
        mergeMap((source) => this.getForSource(source), 6),
        reduce((result, page) => ({
          settings: [...result.settings, ...page.settings],
          failures: [...result.failures, ...page.failures]
        }), initialResult)
      )),
      map((result) => ({
        ...result,
        settings: result.settings.sort((a, b) =>
          a.source.name.localeCompare(b.source.name) || a.name.localeCompare(b.name)
        )
      }))
    );
  }

  private getSources(): Observable<AzureResource[]> {
    const fetchPage = (skipToken?: string): Observable<ResourcePage> => {
      const url = `${environment.azure.resourceManagerUrl}`
        + '/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';
      return this.http.post<ResourcePage>(url, {
        subscriptions: [environment.azure.subscriptionId],
        query: `
          Resources
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
        if (!sources.has(subscriptionId.toLowerCase())) {
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

  private getForSource(source: AzureResource): Observable<DiagnosticSettingsResult> {
    const url = `${environment.azure.resourceManagerUrl}${source.id}`
      + '/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview';
    return this.http.get<DiagnosticSettingsResponse>(url).pipe(
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
