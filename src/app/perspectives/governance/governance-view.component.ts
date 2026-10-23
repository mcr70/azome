/** Coordinates loading and presentation of subscription governance summaries. */
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import {
  GovernanceService,
  GovernanceSnapshot
} from '@services/azure/governance.service';
import { AzureResourceDetail } from '@services/azure/resource-graph.service';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import {
  GovernanceCostCardComponent,
  GovernanceLocksCardComponent,
  GovernancePolicyCardComponent,
  GovernanceSubscriptionsCardComponent,
  GovernanceTagsCardComponent
} from './governance-cards.component';

/** Presents cost, subscription, compliance, tag, and lock health in one view. */
@Component({
  selector: 'app-governance-view',
  standalone: true,
  imports: [
    GovernanceCostCardComponent,
    GovernanceLocksCardComponent,
    GovernancePolicyCardComponent,
    GovernanceSubscriptionsCardComponent,
    GovernanceTagsCardComponent,
    ResourceDetailPaneComponent
  ],
  templateUrl: './governance-view.component.html',
  styleUrl: './governance-view.component.scss'
})
export class GovernanceViewComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly governance = inject(GovernanceService);
  private readonly detailPanels = inject(ResourceDetailPanelService);

  public readonly snapshot = signal<GovernanceSnapshot | null>(null);
  public readonly loading = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly panels = signal<ResourcePanelConfig[]>([]);
  public readonly pinnedPanels = computed(() => this.panels().filter((panel) => panel.pinned));
  public readonly floatingPanel = computed(
    () => this.panels().find((panel) => !panel.pinned) ?? null
  );

  /** Loads the dashboard once when the perspective becomes active. */
  public ngOnInit(): void {
    this.detailPanels.panels$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((panels) => this.panels.set(panels));
    this.refresh();
  }

  /** Refreshes all independently available governance data sources. */
  public refresh(forceRefresh = false): void {
    this.loading.set(true);
    this.error.set(null);
    this.governance.getSnapshot(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          const previous = this.snapshot();
          this.snapshot.set(previous ? {
            ...snapshot,
            costs: snapshot.loadingSections.includes('costs')
              ? previous.costs
              : snapshot.costs,
            quotas: snapshot.loadingSections.includes('quotas')
              ? previous.quotas
              : snapshot.quotas,
            policy: snapshot.loadingSections.includes('policy')
              ? previous.policy
              : snapshot.policy,
            resources: snapshot.loadingSections.includes('resources')
              ? previous.resources
              : snapshot.resources,
            loadedSections: [...new Set([
              ...snapshot.loadedSections,
              ...previous.loadedSections
            ])]
          } : snapshot);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Governance data could not be loaded. Check Azure access and try again.');
          this.loading.set(false);
        }
      });
  }

  /** Opens the shared resource details panel for a selected governance item. */
  public openResourceDetails(resource: AzureResourceDetail): void {
    this.detailPanels.openPanel(resource);
  }

  /** Closes a resource details panel. */
  public closePanel(panelId: string): void {
    this.detailPanels.closePanel(panelId);
  }

  /** Changes the pinned state of a resource details panel. */
  public togglePanelPin(panelId: string): void {
    this.detailPanels.togglePin(panelId);
  }
}
