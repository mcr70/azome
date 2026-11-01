import { Injectable } from '@angular/core';
import { concat, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ResourceGraphService } from '@services/azure/resource-graph.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';

/** Resolution state of a resource linked via the `resourceId` query parameter. */
export interface LinkedMetricResourceState {
  loading: boolean;
  resource: SelectedAzureResource | null;
  error: string | null;
}

/** State used while no linked resource is requested. */
const IDLE_STATE: LinkedMetricResourceState = {
  loading: false,
  resource: null,
  error: null
};

/**
 * Resolves deep-linked metric resources for the Monitoring perspective.
 *
 * Other perspectives link to `/monitoring/metrics?resourceId=...`; this service
 * validates the resource ID and loads the resource so the Metrics explorer can
 * preselect it without touching the global resource selection.
 */
@Injectable({ providedIn: 'root' })
export class LinkedMetricResourceService {

  constructor(private readonly resourceGraph: ResourceGraphService) {}

  /**
   * Resolves a linked resource ID into selectable resource metadata.
   * Emits a loading state first and then the final result, so subscribers can
   * mirror the states directly into their view model.
   *
   * @param resourceId Raw `resourceId` query parameter value, or null when absent.
   * @returns Stream of resolution states ending with the loaded resource or an error.
   */
  public resolve(resourceId: string | null): Observable<LinkedMetricResourceState> {
    if (!resourceId) {
      return of(IDLE_STATE);
    }

    if (!this.isSafeResourceId(resourceId)) {
      return of({
        loading: false,
        resource: null,
        error: 'The linked resource ID is not a valid Azure resource ID.'
      });
    }

    return concat(
      of({ loading: true, resource: null, error: null }),
      this.resourceGraph.getResourceDetails(resourceId).pipe(
        map((resource): LinkedMetricResourceState => resource
          ? {
            loading: false,
            resource: {
              id: resource.id,
              name: resource.name,
              type: resource.type,
              resourceGroup: resource.resourceGroup ?? ''
            },
            error: null
          }
          : {
            loading: false,
            resource: null,
            error: `The resource ${resourceId} was not found in the configured subscription.`
          }),
        catchError((error: unknown) => {
          console.error('Failed to resolve linked metrics resource:', error);
          return of({
            loading: false,
            resource: null,
            error: 'The linked resource could not be resolved. Check your Azure access.'
          });
        })
      )
    );
  }

  /**
   * Validates that a value looks like a plain ARM resource ID, which keeps
   * crafted query parameters out of downstream Resource Graph queries.
   *
   * @param resourceId Candidate resource ID.
   * @returns True when the value matches the expected ARM resource ID shape.
   */
  private isSafeResourceId(resourceId: string): boolean {
    return /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[a-zA-Z0-9._()-]+\/providers\/[a-zA-Z0-9.]+(?:\/[a-zA-Z0-9._()-]+)+$/i
      .test(resourceId);
  }
}
