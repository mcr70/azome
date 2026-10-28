//
// https://learn.microsoft.com/en-us/rest/api/resources/resource-groups?view=rest-resources-2021-04-01
//

import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { ArmApiService } from './arm-api.service';

export interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  properties?: {
    provisioningState: string;
  };
}

interface AzureResponse<T> {
  value: T[];
}

@Injectable({ providedIn: 'root' })
export class ResourceGroupService {
  constructor(private readonly armApi: ArmApiService) {}

public getResourceGroups(): Observable<ResourceGroup[]> {
    const path = `/subscriptions/${environment.azure.subscriptionId}/resourcegroups`;

    return this.armApi.get<AzureResponse<ResourceGroup>>(path, {
      params: { 'api-version': environment.azure.apiVersion }
    }).pipe(
      map(response => response.value)
    );
  }
}