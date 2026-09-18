import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ResourceGraphService, SubnetRoutingDetail } from '../../services/azure/resource-graph.service';

@Component({
  selector: 'app-subnet-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './subnet-detail.component.html',
  styleUrl: './subnet-detail.component.scss'
})
export class SubnetDetailComponent implements OnInit, OnDestroy {
  public subnetName: string | null = null;
  public addressPrefixes: string[] = [];
  public detail: SubnetRoutingDetail | null = null;
  public loading = false;
  public error: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private route: ActivatedRoute, private resourceGraph: ResourceGraphService) {}

  ngOnInit(): void {
    this.loading = true;

    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          this.subnetName = params.get('subnetName');
          this.addressPrefixes = (params.get('addressPrefixes') ?? '').split(',').filter(Boolean);
          const nsgId = params.get('nsgId');
          const routeTableId = params.get('routeTableId');
          return this.resourceGraph.getSubnetRoutingDetail(nsgId, routeTableId);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (detail) => {
          this.detail = detail;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to load subnet routing detail:', error);
          this.error = error.message || 'Azure Resource Graph did not return the subnet detail.';
          this.loading = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
