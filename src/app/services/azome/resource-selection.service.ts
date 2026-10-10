import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SelectedAzureResource {
  id: string;
  type: string;
  name: string;
  resourceGroup: string;
}

@Injectable({ providedIn: 'root' })
export class ResourceSelectionService {
  private readonly selectedResourcesSubject = new BehaviorSubject<SelectedAzureResource[]>([]);

  public readonly selectedResources$ = this.selectedResourcesSubject.asObservable();

  public get selectedResources(): SelectedAzureResource[] {
    return this.selectedResourcesSubject.value;
  }

  public isSelected(resourceId: string): boolean {
    const normalizedId = this.normalizeId(resourceId);
    return this.selectedResources.some((resource) => this.normalizeId(resource.id) === normalizedId);
  }

  public isFirstSelected(resourceId: string): boolean {
    const firstResource = this.selectedResources[0];
    return firstResource !== undefined
      && this.normalizeId(firstResource.id) === this.normalizeId(resourceId);
  }

  public select(resource: SelectedAzureResource): void {
    const normalizedId = this.normalizeId(resource.id);
    const resources = this.selectedResources.filter(
      (selected) => this.normalizeId(selected.id) !== normalizedId
    );
    this.selectedResourcesSubject.next([...resources, resource]);
  }

  public deselect(resourceId: string): void {
    const normalizedId = this.normalizeId(resourceId);
    this.selectedResourcesSubject.next(
      this.selectedResources.filter((resource) => this.normalizeId(resource.id) !== normalizedId)
    );
  }

  public clear(): void {
    this.selectedResourcesSubject.next([]);
  }

  private normalizeId(resourceId: string): string {
    return resourceId.replace(/\/+$/, '').toLocaleLowerCase();
  }
}
