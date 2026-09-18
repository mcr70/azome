import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NetworkTopology, ResourceGraphService } from '../../services/azure/resource-graph.service';
import { NetworkGraphComponent } from './network-graph.component';
import { SubnetNavigation } from './network-graph.model';

@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  imports: [CommonModule, RouterLink, NetworkGraphComponent],
  templateUrl: './networking-perspective.component.html',
  styleUrl: './networking-perspective.component.scss'
})
export class NetworkingPerspectiveComponent implements OnInit, OnDestroy {
  public topologies: NetworkTopology[] = [];
  public loading = false;
  public error: string | null = null;
  public viewMode: 'list' | 'graph' = 'list';

  private readonly destroy$ = new Subject<void>();

  constructor(private resourceGraph: ResourceGraphService, private router: Router) {}

  ngOnInit(): void {
    this.loadTopologies();
  }

  public loadTopologies(): void {
    this.loading = true;
    this.error = null;

    this.resourceGraph.getNetworkTopologies()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (topologies) => {
          this.topologies = topologies;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to load network topology:', error);
          this.error = error.message || 'Azure Resource Graph did not return the network topology.';
          this.loading = false;
        }
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public onSubnetSelected(navigation: SubnetNavigation): void {
    this.router.navigate(['/networking/subnets', navigation.subnetName], {
      queryParams: {
        subnetName: navigation.subnetName,
        addressPrefixes: navigation.addressPrefixes.join(','),
        nsgId: navigation.networkSecurityGroupId,
        routeTableId: navigation.routeTableId
      }
    });
  }
}
