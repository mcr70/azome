import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceGroupService, ResourceGroup } from '../../services/azure/resource-group.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-resource-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resource-group.component.html',
  styleUrls: ['./resource-group.component.scss'] // Optional, can be omitted if not used
})
export class ResourceGroupComponent implements OnInit, OnDestroy {
  public resourceGroups: ResourceGroup[] = [];
  public loading = false;
  public error: string | null = null;
  
  private readonly destroy$ = new Subject<void>();

  constructor(private rgService: ResourceGroupService) {}

  ngOnInit(): void {
    this.loadResourceGroups();
  }

  public loadResourceGroups(): void {
    this.loading = true;
    this.error = null;

    this.rgService.getResourceGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.resourceGroups = groups;
          this.loading = false;
        },
        error: (err) => {
          console.error('Failed to fetch resource groups:', err);
          this.error = err.message || 'Failed to fetch resource groups from Azure API';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}