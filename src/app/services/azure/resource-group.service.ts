//
// https://learn.microsoft.com/en-us/rest/api/resources/resource-groups?view=rest-resources-2021-04-01
//

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

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
  constructor(private http: HttpClient) {}

public getResourceGroups(): Observable<ResourceGroup[]> {
    const url = `${environment.azure.resourceManagerUrl}/subscriptions/${environment.azure.subscriptionId}/resourcegroups?api-version=${environment.azure.apiVersion}`;
    
    // Interceptorin tulee hoitaa headerin lisäys automaattisesti!
    return this.http.get<AzureResponse<ResourceGroup>>(url).pipe(
      map(response => response.value)
    );
  }
}