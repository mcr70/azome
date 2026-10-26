/** Provides subscription governance data from Azure Resource Manager APIs. */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, from, merge, of, throwError, timer } from 'rxjs';
import {
  catchError,
  concatMap,
  finalize,
  map,
  retry,
  scan,
  shareReplay,
  startWith,
  switchMap,
  tap,
  toArray
} from 'rxjs/operators';
import { environment } from '@environments/environment';

const GOVERNANCE_ENDPOINT = '/governance-proxy';
const RESOURCE_GRAPH_API_VERSION = '2021-06-01-preview';
const SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000;
const COST_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type GovernanceSection = 'costs' | 'quotas' | 'policy' | 'resources';
type GovernanceSnapshotUpdater = (snapshot: GovernanceSnapshot) => GovernanceSnapshot;

export interface GovernanceSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
  authorizationSource?: string;
}

export interface GovernanceCostSummary {
  monthToDate: number | null;
  forecast: number | null;
  currency: string;
  services: Array<{ name: string; cost: number }>;
}

export interface GovernanceQuota {
  name: string;
  currentValue: number;
  limit: number;
  unit: string;
}

export interface GovernancePolicySummary {
  compliant: number;
  nonCompliant: number;
  violations: Array<{
    resource: string;
    policy: string;
    state: string;
    policyDefinitionId?: string;
    policySetDefinitionName?: string;
    policySetDefinitionId?: string;
    policyAssignmentName?: string;
    policyAssignmentId?: string;
    timestamp?: string;
  }>;
}

export interface GovernanceResourceSummary {
  missingTags: Array<{ name: string; resourceGroup: string; missing: string[] }>;
  locks: Array<{ name: string; level: string; resourceId: string }>;
}

export interface GovernanceSnapshot {
  subscriptions: GovernanceSubscription[];
  costs: GovernanceCostSummary;
  quotas: GovernanceQuota[];
  policy: GovernancePolicySummary;
  resources: GovernanceResourceSummary;
  errors: string[];
  loadingSections: GovernanceSection[];
  loadedSections: Array<GovernanceSection | 'subscriptions'>;
}

interface AzureList<T> {
  value: T[];
}

interface CostResponse {
  properties?: {
    columns?: Array<{ name: string; type: string }>;
    rows?: unknown[][];
  };
}

interface ResourceGraphResponse<T> {
  data: T[];
}

/** Loads costs, quotas, policy results, tag gaps, and locks for the dashboard. */
@Injectable({ providedIn: 'root' })
export class GovernanceService {
  private snapshotCache: { value: GovernanceSnapshot; expiresAt: number } | null = null;
  private snapshotRequest: Observable<GovernanceSnapshot> | null = null;
  private readonly actualCostCache = new Map<
    string,
    { value: GovernanceCostSummary; expiresAt: number }
  >();
  private readonly forecastCache = new Map<string, { value: number | null; expiresAt: number }>();

  constructor(private readonly http: HttpClient) {}

  /** Returns cached data, shares in-flight loads, or loads a fresh dashboard snapshot. */
  public getSnapshot(forceRefresh = false): Observable<GovernanceSnapshot> {
    if (!forceRefresh && this.snapshotCache && this.snapshotCache.expiresAt > Date.now()) {
      return of(this.snapshotCache.value);
    }
    if (this.snapshotRequest) {
      return this.snapshotRequest;
    }

    this.snapshotRequest = this.loadSnapshot().pipe(
      tap((snapshot) => {
        if (snapshot.loadingSections.length === 0) {
          this.snapshotCache = {
            value: snapshot,
            expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS
          };
        }
      }),
      finalize(() => {
        this.snapshotRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.snapshotRequest;
  }

  /** Fetch the complete JSON definition or initiative details of a policy by its ID. */
  public getPolicyJson(policyId: string): Observable<any> {
    const url = `${environment.azure.resourceManagerUrl}${policyId}`;
    const params = new HttpParams().set('api-version', '2023-04-01');

    return this.http.get<any>(url, { params });
  }

  /** Resolves display names for known policy definition IDs in one Resource Graph query. */
  public getPolicyDefinitionDisplayNames(
    policyDefinitionIds: string[]
  ): Observable<Record<string, string>> {
    const definitionIds = [...new Set(policyDefinitionIds.map((id) => id.trim().toLowerCase()))]
      .filter(Boolean);
    if (definitionIds.length === 0) {
      return of({});
    }

    const idFilter = definitionIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(', ');
    const query = `PolicyResources
      | where type =~ 'microsoft.authorization/policydefinitions'
      | where tolower(id) in~ (${idFilter})
      | project id=tolower(id), displayName=tostring(properties.displayName)`;
    const subscriptionIds = this.snapshotCache?.value.subscriptions
      .map((subscription) => subscription.subscriptionId)
      ?? [environment.azure.subscriptionId];

    return this.executeResourceGraph<{ id: string; displayName: string }>(
      query,
      subscriptionIds,
      'policy definition display names',
      { authorizationScopeFilter: 'AtScopeAboveAndBelow' }
    ).pipe(map((definitions) => Object.fromEntries(
      definitions
        .filter((definition) => !!definition.id && !!definition.displayName)
        .map((definition) => [definition.id.toLowerCase(), definition.displayName])
    )));
  }


  /** Loads the dashboard snapshot across all visible subscriptions. */
  private loadSnapshot(): Observable<GovernanceSnapshot> {
    return this.get<AzureList<GovernanceSubscription>>('/subscriptions', {
      'api-version': '2022-12-01'
    }).pipe(
      map((response) => response.value ?? []),
      switchMap((subscriptions) => {
        const subscriptionIds = subscriptions.map((item) => item.subscriptionId);
        const activeSubscriptionId = environment.azure.subscriptionId;
        const errors: string[] = [];
        const quotaSubscriptions = subscriptions.length > 0
          ? subscriptions
          : [{ subscriptionId: activeSubscriptionId, displayName: 'Configured subscription', state: 'Unknown' }];
        const quotaRequests = quotaSubscriptions.map((subscription) =>
          this.getQuotas(subscription.subscriptionId).pipe(
            map((quotas) => quotas.map((quota) => ({
              ...quota,
              name: `${subscription.displayName}: ${quota.name}`
            })))
          )
        );
        const previous = this.snapshotCache?.value;
        const initial: GovernanceSnapshot = {
          subscriptions,
          costs: previous?.costs ?? {
            monthToDate: null,
            forecast: null,
            currency: 'USD',
            services: []
          },
          quotas: previous?.quotas ?? [],
          policy: previous?.policy ?? {
            compliant: 0,
            nonCompliant: 0,
            violations: []
          },
          resources: previous?.resources ?? { missingTags: [], locks: [] },
          errors: [],
          loadingSections: ['costs', 'quotas', 'policy', 'resources'],
          loadedSections: previous?.loadedSections ?? ['subscriptions']
        };
        const costIds = subscriptionIds.length > 0 ? subscriptionIds : [activeSubscriptionId];
        const updates = merge(
          this.createSnapshotUpdate(
            'costs',
            this.getCostSummary(costIds),
            initial.costs,
            'Cost data'
          ),
          this.createSnapshotUpdate(
            'quotas',
            forkJoin(quotaRequests).pipe(map((results) => results.flat())),
            initial.quotas,
            'Quota data'
          ),
          this.createSnapshotUpdate(
            'policy',
            this.getPolicySummary(subscriptionIds),
            initial.policy,
            'Policy data'
          ),
          this.createSnapshotUpdate(
            'resources',
            this.getResourceSummary(subscriptionIds),
            initial.resources,
            'Resource data'
          )
        );

        return updates.pipe(
          scan((snapshot, update) => update(snapshot), initial),
          startWith(initial)
        );
      })
    );
  }

  /** Converts one domain request into a snapshot update without blocking other cards. */
  private createSnapshotUpdate<T>(
    section: GovernanceSection,
    request: Observable<T>,
    fallback: T,
    label: string
  ): Observable<GovernanceSnapshotUpdater> {
    return request.pipe(
      map((value): GovernanceSnapshotUpdater => (snapshot) => ({
        ...snapshot,
        [section]: value,
        loadingSections: snapshot.loadingSections.filter((item) => item !== section),
        loadedSections: snapshot.loadedSections.includes(section)
          ? snapshot.loadedSections
          : [...snapshot.loadedSections, section]
      })),
      catchError((error: unknown) => of((snapshot: GovernanceSnapshot) => ({
        ...snapshot,
        [section]: fallback,
        loadingSections: snapshot.loadingSections.filter((item) => item !== section),
        loadedSections: snapshot.loadedSections.includes(section)
          ? snapshot.loadedSections
          : [...snapshot.loadedSections, section],
        errors: [...snapshot.errors, `${label}: ${this.getAzureErrorMessage(error)}`]
      })))
    );
  }

  /** Retrieves current month cost grouped by service and a month-end forecast. */
  private getCostSummary(subscriptionIds: string[]): Observable<GovernanceCostSummary> {
    return from(subscriptionIds).pipe(
      concatMap((subscriptionId) => this.getSubscriptionCostSummary(subscriptionId)),
      toArray(),
      map((summaries) => {
        const serviceCosts = new Map<string, number>();
        for (const summary of summaries) {
          for (const service of summary.services) {
            serviceCosts.set(service.name, (serviceCosts.get(service.name) ?? 0) + service.cost);
          }
        }
        return {
          monthToDate: summaries.some((summary) => summary.monthToDate === null)
            ? null
            : summaries.reduce((sum, summary) => sum + (summary.monthToDate ?? 0), 0),
          forecast: summaries.some((summary) => summary.forecast === null)
            ? null
            : summaries.reduce((sum, summary) => sum + (summary.forecast ?? 0), 0),
          currency: summaries[0]?.currency ?? 'USD',
          services: [...serviceCosts.entries()]
            .map(([name, cost]) => ({ name, cost }))
            .sort((left, right) => right.cost - left.cost)
        };
      })
    );
  }

  /** Loads actual and forecast cost for one subscription. */
  private getSubscriptionCostSummary(subscriptionId: string): Observable<GovernanceCostSummary> {
    const path = `/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query`;
    const params = new HttpParams().set('api-version', '2023-03-01');
    const body = {
      type: 'ActualCost',
      timeframe: 'MonthToDate',
      dataset: {
        granularity: 'None',
        aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } },
        grouping: [{ type: 'Dimension', name: 'ServiceName' }]
      }
    };
    const cachedActual = this.actualCostCache.get(subscriptionId);
    const actualCost = cachedActual && cachedActual.expiresAt > Date.now()
      ? of(cachedActual.value)
      : this.http.post<CostResponse>(
        `${environment.azure.proxyUrl}${GOVERNANCE_ENDPOINT}${path}`, body, { params }
      ).pipe(
        this.withCostManagementRetry<CostResponse>(),
        map((response) => this.toCostSummary(response)),
        tap((summary) => this.actualCostCache.set(subscriptionId, {
          value: summary,
          expiresAt: Date.now() + COST_CACHE_TTL_MS
        }))
      );

    return actualCost.pipe(switchMap((costs) => {
      const cachedForecast = this.forecastCache.get(subscriptionId);
      const forecast = cachedForecast && cachedForecast.expiresAt > Date.now()
        ? of(cachedForecast.value)
        : this.getForecast(subscriptionId).pipe(
          tap((value) => this.forecastCache.set(subscriptionId, {
            value,
            expiresAt: Date.now() + COST_CACHE_TTL_MS
          }))
        );
      return forecast.pipe(map((value) => ({ ...costs, forecast: value })));
    }));
  }

  /** Retries Cost Management throttling responses after Azure's advised delay. */
  private withCostManagementRetry<T>() {
    return (source: Observable<T>): Observable<T> => source.pipe(retry({
      count: 3,
      delay: (error: unknown, retryCount: number) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 429) {
          return throwError(() => error);
        }

        const headerDelay = Number(
          error.headers.get('x-ms-ratelimit-microsoft.consumption-retry-after')
          ?? error.headers.get('Retry-After')
        );
        const backoffDelay = Math.min(30_000, 1_000 * (2 ** (retryCount - 1)));
        const delayMs = Number.isFinite(headerDelay) && headerDelay > 0
          ? Math.max(backoffDelay, headerDelay * 1_000)
          : backoffDelay;
        const jitterMs = Math.floor(Math.random() * Math.min(1_000, delayMs * 0.2));
        return timer(delayMs + jitterMs);
      }
    }));
  }

  /** Retrieves the cost forecast for the remaining current month. */
  private getForecast(subscriptionId: string): Observable<number | null> {
    const path = `/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/forecast`;
    const params = new HttpParams().set('api-version', '2023-11-01');
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const body = {
      type: 'Usage',
      timeframe: 'Custom',
      includeActualCost: true,
      timePeriod: {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: end.toISOString()
      },
      dataset: {
        granularity: 'Daily',
        aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } }
      }
    };

    return this.http.post<CostResponse>(
      `${environment.azure.proxyUrl}${GOVERNANCE_ENDPOINT}${path}`, body, { params }
    ).pipe(
      this.withCostManagementRetry<CostResponse>(),
      map((response) => this.firstNumericValue(response))
    );
  }

  /** Retrieves compute quota usage for the configured subscription region. */
  private getQuotas(subscriptionId: string): Observable<GovernanceQuota[]> {
    const path = `/subscriptions/${subscriptionId}/providers/Microsoft.Compute/locations/eastus/usages`;
    const params = new HttpParams().set('api-version', '2023-09-01');
    return this.get<AzureList<{
      name: { value: string; localizedValue: string };
      currentValue: number;
      limit: number;
      unit: string;
    }>>(path, params).pipe(
      map((response) => response.value
        .filter((quota) => quota.limit > 0 && quota.currentValue / quota.limit >= 0.7)
        .map((quota) => ({
          name: quota.name.localizedValue || quota.name.value,
          currentValue: quota.currentValue,
          limit: quota.limit,
          unit: quota.unit
        })))
    );
  }

  /** Summarizes policy compliance and returns a sample of non-compliant resources. */
  private getPolicySummary(subscriptionIds: string[]): Observable<GovernancePolicySummary> {
    const query = `PolicyResources
      | where type =~ 'microsoft.policyinsights/policystates'
      | extend resourceId=tolower(tostring(properties.resourceId)),
          state=tostring(properties.complianceState)
      | where state in~ ('Compliant', 'NonCompliant')
      | summarize hasNonCompliant=countif(state =~ 'NonCompliant') > 0 by resourceId
      | summarize compliant=countif(hasNonCompliant == false),
          nonCompliant=countif(hasNonCompliant == true)`;
    const violations = `PolicyResources
      | where type =~ 'microsoft.policyinsights/policystates'
      | where tostring(properties.complianceState) =~ 'NonCompliant'
      | extend policyDefinitionId=tolower(tostring(properties.policyDefinitionId)),
          policySetDefinitionId=tolower(tostring(properties.policySetDefinitionId))
      | join kind=leftouter (
          PolicyResources
          | where type =~ 'microsoft.authorization/policydefinitions'
          | project policyDefinitionId=tolower(id),
              policyDefinitionDisplayName=tostring(properties.displayName)
        ) on policyDefinitionId
      | join kind=leftouter (
          PolicyResources
          | where type =~ 'microsoft.authorization/policysetdefinitions'
          | project policySetDefinitionId=tolower(id),
              policySetDefinitionName=tostring(properties.displayName)
        ) on policySetDefinitionId
      | project resource=tostring(properties.resourceId),
          policy=coalesce(policyDefinitionDisplayName,
            tostring(properties.policyDefinitionName), policyDefinitionId),
          state=tostring(properties.complianceState),
          policyDefinitionId,
          policySetDefinitionName,
          policySetDefinitionId,
          policyAssignmentName=tostring(properties.policyAssignmentName),
          policyAssignmentId=tostring(properties.policyAssignmentId),
          timestamp=tostring(properties.timestamp)
      | take 30`;

    return forkJoin({
      summary: this.executeResourceGraph<{ compliant: number; nonCompliant: number }>(
        query, subscriptionIds, 'policy compliance summary'
      ),
      violations: this.executeResourceGraph<GovernancePolicySummary['violations'][number]>(
        violations,
        subscriptionIds,
        'policy violations',
        { authorizationScopeFilter: 'AtScopeAboveAndBelow' }
      )
    }).pipe(map((response) => {
      const compliant = Number(response.summary[0]?.compliant ?? 0);
      const nonCompliant = Number(response.summary[0]?.nonCompliant ?? 0);
      return {
        compliant,
        nonCompliant,
        violations: response.violations
      };
    }));
  }

  /** Finds resources missing required tags and protected by subscription locks. */
  private getResourceSummary(subscriptionIds: string[]): Observable<GovernanceResourceSummary> {
    const tagsQuery = `Resources
      | extend missingTag = pack_array(
          iff(isempty(tostring(tags['Environment'])), 'Environment', ''),
          iff(isempty(tostring(tags['Owner'])), 'Owner', ''),
          iff(isempty(tostring(tags['CostCenter'])), 'CostCenter', ''))
      | mv-expand missingTag
      | where tostring(missingTag) != ''
      | summarize missingTagNames=make_set(tostring(missingTag)) by name, resourceGroup
      | project name, resourceGroup, missingTagNames
      | take 100`;
    const locksQuery = `Resources
      | where tostring(tags['Environment']) in~ ('Production', 'Prod')
      | project resourceId=id, resourceName=name, subscriptionId
      | join kind=inner (
          AuthorizationResources
          | where type =~ 'microsoft.authorization/locks'
          | where tostring(properties.level) in~ ('CanNotDelete', 'ReadOnly')
          | extend lockScope=coalesce(
              tostring(properties.scope),
              replace_regex(id, '/providers/Microsoft.Authorization/locks/[^/]+$', ''))
          | project lockName=name, level=tostring(properties.level), lockScope, subscriptionId
        ) on subscriptionId
      | where resourceId == lockScope or resourceId startswith strcat(lockScope, '/')
      | project name=resourceName, level, resourceId, lockName
      | take 100`;

    return forkJoin({
      missingTags: this.executeResourceGraph<{
        name: string;
        resourceGroup: string;
        missingTagNames: string[];
      }>(tagsQuery, subscriptionIds, 'missing governance tags').pipe(
        map((resources) => resources.map((resource) => ({
          name: resource.name,
          resourceGroup: resource.resourceGroup,
          missing: resource.missingTagNames
        })))
      ),
      locks: this.executeResourceGraph<{
        name: string;
        level: string;
        resourceId: string;
      }>(locksQuery, subscriptionIds, 'production resource locks')
    });
  }

  /** Runs a Resource Graph query for the supplied subscription set. */
  private executeResourceGraph<T>(
    query: string,
    subscriptions: string[],
    queryName = 'resource query',
    queryOptions: { authorizationScopeFilter?: string } = {}
  ): Observable<T[]> {
    if (subscriptions.length === 0) {
      return of([]);
    }
    const params = new HttpParams().set('api-version', RESOURCE_GRAPH_API_VERSION);
    return this.http.post<ResourceGraphResponse<T>>(
      `${environment.azure.proxyUrl}${GOVERNANCE_ENDPOINT}/providers/Microsoft.ResourceGraph/resources`,
      {
        subscriptions,
        query,
        options: { resultFormat: 'objectArray', ...queryOptions }
      },
      { params }
    ).pipe(
      map((response) => response.data ?? []),
      catchError((error: HttpErrorResponse) => {
        const details = this.getAzureErrorMessage(error);
        console.error(`Governance Resource Graph ${queryName} failed: ${details}`, {
          status: error.status,
          query,
          response: error.error
        });
        throw error;
      })
    );
  }

  /** Extracts the service-provided message from an Azure HTTP error response. */
  private getAzureErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error ? error.message : 'The request failed.';
    }
    const azureMessage = error.error?.error?.message ?? error.error?.message;
    return typeof azureMessage === 'string' ? azureMessage : error.message;
  }

  /** Sends a GET request to an allowlisted Azure management path. */
  private get<T>(path: string, query: HttpParams | Record<string, string>): Observable<T> {
    return this.http.get<T>(`${environment.azure.proxyUrl}${GOVERNANCE_ENDPOINT}${path}`, { params: query });
  }

  /** Converts a Cost Management table response into service totals. */
  private toCostSummary(response: CostResponse): GovernanceCostSummary {
    const columns = response.properties?.columns ?? [];
    const rows = response.properties?.rows ?? [];
    const costIndex = columns.findIndex((column) => /cost/i.test(column.name));
    const currencyIndex = columns.findIndex((column) => /currency/i.test(column.name));
    const serviceIndex = columns.findIndex((column) => /service/i.test(column.name));
    const services = rows.map((row) => ({
      name: String(row[serviceIndex] ?? 'Other'),
      cost: Number(row[costIndex] ?? 0)
    })).sort((left, right) => right.cost - left.cost);
    return {
      monthToDate: services.reduce((sum, service) => sum + service.cost, 0),
      forecast: null,
      currency: String(rows[0]?.[currencyIndex] ?? 'USD'),
      services
    };
  }

  /** Reads the first numeric measure from a Cost Management response. */
  private firstNumericValue(response: CostResponse): number | null {
    const index = (response.properties?.columns ?? [])
      .findIndex((column) => /cost|forecast/i.test(column.name));
    const rows = response.properties?.rows ?? [];
    if (index < 0 || rows.length === 0) {
      return null;
    }
    return rows.reduce((sum, row) => sum + Number(row[index] ?? 0), 0);
  }

}
