import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ResourceGraphService } from '@services/azure/resource-graph.service';
import {
  LinkedMetricResourceService,
  LinkedMetricResourceState
} from './linked-metric-resource.service';

describe('LinkedMetricResourceService', () => {
  let service: LinkedMetricResourceService;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  const resourceId = '/subscriptions/00000000-0000-0000-0000-000000000001'
    + '/resourceGroups/apps/providers/Microsoft.Web/sites/orders';

  const resolve = (id: string | null): LinkedMetricResourceState[] => {
    const states: LinkedMetricResourceState[] = [];
    service.resolve(id).subscribe((state) => states.push(state));
    return states;
  };

  beforeEach(() => {
    graph = jasmine.createSpyObj<ResourceGraphService>(
      'ResourceGraphService',
      ['getResourceDetails']
    );
    TestBed.configureTestingModule({
      providers: [{ provide: ResourceGraphService, useValue: graph }]
    });
    service = TestBed.inject(LinkedMetricResourceService);
  });

  it('emits an idle state when no resource ID is requested', () => {
    expect(resolve(null)).toEqual([{ loading: false, resource: null, error: null }]);
    expect(graph.getResourceDetails).not.toHaveBeenCalled();
  });

  it('rejects unsafe resource IDs without querying Resource Graph', () => {
    const states = resolve(`${resourceId}'|take 1`);

    expect(states.length).toBe(1);
    expect(states[0].loading).toBeFalse();
    expect(states[0].error).toContain('not a valid Azure resource ID');
    expect(graph.getResourceDetails).not.toHaveBeenCalled();
  });

  it('emits a loading state and then the resolved resource', () => {
    graph.getResourceDetails.and.returnValue(of({
      id: resourceId,
      name: 'orders',
      type: 'Microsoft.Web/sites',
      resourceGroup: 'apps'
    }));

    expect(resolve(resourceId)).toEqual([
      { loading: true, resource: null, error: null },
      {
        loading: false,
        resource: {
          id: resourceId,
          name: 'orders',
          type: 'Microsoft.Web/sites',
          resourceGroup: 'apps'
        },
        error: null
      }
    ]);
  });

  it('reports a missing resource', () => {
    graph.getResourceDetails.and.returnValue(of(null));
    const states = resolve(resourceId);

    expect(states.length).toBe(2);
    expect(states[1].resource).toBeNull();
    expect(states[1].error).toContain('was not found');
  });

  it('reports a resolution failure', () => {
    spyOn(console, 'error');
    graph.getResourceDetails.and.returnValue(throwError(() => new Error('boom')));
    const states = resolve(resourceId);

    expect(states.length).toBe(2);
    expect(states[1].error).toContain('could not be resolved');
  });
});
