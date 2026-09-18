import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NetworkTopology, ResourceGraphService } from '../../services/azure/resource-graph.service';

@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './networking-perspective.component.html',
  styleUrl: './networking-perspective.component.scss'
})
export class NetworkingPerspectiveComponent implements OnInit, OnDestroy {
  public topologies: NetworkTopology[] = [];
  public loading = false;
  public error: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private resourceGraph: ResourceGraphService) {}

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
