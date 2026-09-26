import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LogAnalyticsWorkspace {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  properties: {
    customerId?: string;
    retentionInDays?: number;
    features?: { enableLogAccessUsingOnlyResourcePermissions?: boolean };
  };
}

export interface ActivityLogEvent {
  id: string;
  eventTimestamp: string;
  operationName?: { value?: string; localizedValue?: string };
  status?: { value?: string; localizedValue?: string };
  level?: string;
  caller?: string;
  resourceGroupName?: string;
  resourceId?: string;
  subscriptionId?: string;
}

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  constructor(private http: HttpClient) {}

  getWorkspaces(): Observable<LogAnalyticsWorkspace[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = "Resources | where type =~ 'microsoft.operationalinsights/workspaces' | project id, name, resourceGroup, location, properties | order by name asc";

    return this.http.post<{ data?: LogAnalyticsWorkspace[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: { resultFormat: 'objectArray' }
    }).pipe(map((response) => response.data ?? []));
  }

  getActivityLog(): Observable<ActivityLogEvent[]> {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const filter = `eventTimestamp ge '${start.toISOString()}' and eventTimestamp le '${end.toISOString()}'`;
    const url = `${environment.azure.resourceManagerUrl}/subscriptions/${environment.azure.subscriptionId}/providers/Microsoft.Insights/eventtypes/management/values`;
    const params = new HttpParams()
      .set('api-version', '2015-04-01')
      .set('$filter', filter);

    return this.http.get<{ value?: ActivityLogEvent[] }>(url, { params })
      .pipe(map((response) => response.value ?? []));
  }
}
