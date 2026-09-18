import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceGroup, ResourceGroupService } from '../../services/azure/resource-group.service';

@Component({
  selector: 'app-resource-group-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resource-group-list.component.html'
})
export class ResourceGroupListComponent implements OnInit, OnDestroy {
  public resourceGroups: ResourceGroup[] = [];
  public loading = false;
  public error: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private resourceGroupService: ResourceGroupService) {}

  ngOnInit(): void {
    this.loadResourceGroups();
  }

  public loadResourceGroups(): void {
    this.loading = true;
    this.error = null;

    this.resourceGroupService.getResourceGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.resourceGroups = groups;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to fetch resource groups:', error);
          this.error = error.message || 'Failed to fetch resource groups from Azure API';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
