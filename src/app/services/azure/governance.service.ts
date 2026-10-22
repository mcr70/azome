/** Provides subscription governance data from Azure Resource Manager APIs. */
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '@environments/environment';

const GOVERNANCE_ENDPOINT = '/governance-proxy';
const RESOURCE_GRAPH_API_VERSION = '2021-03-01';

export interface GovernanceSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
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
  violations: Array<{ resource: string; policy: string; state: string }>;
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
  constructor(private readonly http: HttpClient) {}

  /** Loads the dashboard snapshot across all visible subscriptions. */
  public getSnapshot(): Observable<GovernanceSnapshot> {
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
        const queries = forkJoin({
          costs: this.getCostSummary(subscriptionIds.length > 0 ? subscriptionIds : [activeSubscriptionId]).pipe(
            this.withFallback<GovernanceCostSummary>(
              { monthToDate: null, forecast: null, currency: 'USD', services: [] },
              errors,
              'Cost data'
            )
          ),
          quotas: forkJoin(quotaRequests).pipe(
            map((results) => results.flat()),
            this.withFallback<GovernanceQuota[]>([], errors, 'Quota data')
          ),
          policy: this.getPolicySummary(subscriptionIds).pipe(
            this.withFallback<GovernancePolicySummary>(
              { compliant: 0, nonCompliant: 0, violations: [] },
              errors,
              'Policy data'
            )
          ),
          resources: this.getResourceSummary(subscriptionIds).pipe(
            this.withFallback<GovernanceResourceSummary>(
              { missingTags: [], locks: [] },
              errors,
              'Resource data'
            )
          )
        });

        return queries.pipe(map((data) => ({
          subscriptions,
          costs: data.costs,
          quotas: data.quotas,
          policy: data.policy,
          resources: data.resources,
          errors
        })));
      })
    );
  }

  /** Retrieves current month cost grouped by service and a month-end forecast. */
  private getCostSummary(subscriptionIds: string[]): Observable<GovernanceCostSummary> {
    return forkJoin(subscriptionIds.map((subscriptionId) =>
      this.getSubscriptionCostSummary(subscriptionId)
    )).pipe(map((summaries) => {
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
    }));
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

    return this.http.post<CostResponse>(`${GOVERNANCE_ENDPOINT}${path}`, body, { params }).pipe(
      map((response) => this.toCostSummary(response)),
      switchMap((costs) => this.getForecast(subscriptionId).pipe(
        map((forecast) => ({ ...costs, forecast }))
      ))
    );
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

    return this.http.post<CostResponse>(`${GOVERNANCE_ENDPOINT}${path}`, body, { params }).pipe(
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
      | project resource=tostring(properties.resourceId), policy=tostring(properties.policyDefinitionName),
          state=tostring(properties.complianceState)
      | take 30`;

    return forkJoin({
      summary: this.executeResourceGraph<{ compliant: number; nonCompliant: number }>(
        query, subscriptionIds
      ),
      violations: this.executeResourceGraph<{ resource: string; policy: string; state: string }>(
        violations, subscriptionIds
      )
    }).pipe(map((response) => {
      const compliant = Number(response.summary[0]?.compliant ?? 0);
      const nonCompliant = Number(response.summary[0]?.nonCompliant ?? 0);
      return { compliant, nonCompliant, violations: response.violations };
    }));
  }

  /** Finds resources missing required tags and protected by subscription locks. */
  private getResourceSummary(subscriptionIds: string[]): Observable<GovernanceResourceSummary> {
    const tagsQuery = `Resources
      | extend missing = pack_array(
          iff(isempty(tostring(tags['Environment'])), 'Environment', ''),
          iff(isempty(tostring(tags['Owner'])), 'Owner', ''),
          iff(isempty(tostring(tags['CostCenter'])), 'CostCenter', ''))
      | mv-expand missing
      | where tostring(missing) != ''
      | summarize missing=make_set(tostring(missing)) by name, resourceGroup
      | project name, resourceGroup, missing
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
        missing: string[];
      }>(tagsQuery, subscriptionIds),
      locks: this.executeResourceGraph<{
        name: string;
        level: string;
        resourceId: string;
      }>(locksQuery, subscriptionIds)
    });
  }

  /** Runs a Resource Graph query for the supplied subscription set. */
  private executeResourceGraph<T>(query: string, subscriptions: string[]): Observable<T[]> {
    if (subscriptions.length === 0) {
      return of([]);
    }
    const params = new HttpParams().set('api-version', RESOURCE_GRAPH_API_VERSION);
    return this.http.post<ResourceGraphResponse<T>>(
      `${GOVERNANCE_ENDPOINT}/providers/Microsoft.ResourceGraph/resources`,
      { subscriptions, query, options: { resultFormat: 'objectArray' } },
      { params }
    ).pipe(map((response) => response.data ?? []));
  }

  /** Sends a GET request to an allowlisted Azure management path. */
  private get<T>(path: string, query: HttpParams | Record<string, string>): Observable<T> {
    return this.http.get<T>(`${GOVERNANCE_ENDPOINT}${path}`, { params: query });
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

  /** Records an optional data-source failure while preserving the dashboard. */
  private withFallback<T>(fallback: T, errors: string[], label: string) {
    return (source: Observable<T>): Observable<T> => source.pipe(catchError(() => {
      errors.push(`${label} is unavailable for the current account or subscription.`);
      return of(fallback);
    }));
  }
}
