/** Coordinates loading and presentation of subscription governance summaries. */
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import {
  GovernancePolicyFilters,
  GovernanceService,
  GovernanceTab,
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
  private readonly loadingTabs = new Set<GovernanceTab>();
  private policyPageTokens: Array<string | undefined> = [undefined];

  public readonly snapshot = signal<GovernanceSnapshot | null>(null);
  public readonly loading = signal(false);
  public readonly policyPageLoading = signal(false);
  public readonly policyPageIndex = signal(0);
  public readonly policyPageSize = signal(30);
  public readonly policyFilters = signal<GovernancePolicyFilters>({});
  public readonly error = signal<string | null>(null);
  public readonly activeTab = signal<GovernanceTab>('subscriptions');
  public readonly panels = signal<ResourcePanelConfig[]>([]);
  public readonly pinnedPanels = computed(() => this.panels().filter((panel) => panel.pinned));
  public readonly floatingPanel = computed(
    () => this.panels().find((panel) => !panel.pinned) ?? null
  );

  /** Loads the active tab when the perspective becomes active. */
  public ngOnInit(): void {
    this.detailPanels.panels$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((panels) => this.panels.set(panels));
    this.refresh();
  }

  /** Refreshes all independently available governance data sources. */
  public refresh(forceRefresh = false): void {
    const tab = this.activeTab();
    if (forceRefresh && tab === 'policies') {
      this.resetPolicyPaging();
    }
    this.loadingTabs.add(tab);
    this.loading.set(true);
    this.error.set(null);
    this.governance.getSnapshot(
      tab,
      forceRefresh,
      this.policyPageSize(),
      this.policyFilters()
    )
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
          if (tab === 'policies') {
            this.policyPageIndex.set(snapshot.policy.pageIndex);
            this.policyPageSize.set(snapshot.policy.pageSize);
            if (!snapshot.loadingSections.includes('policy')) {
              this.policyFilters.set(snapshot.policy.filters);
            }
            this.policyPageTokens = [undefined];
          }
        },
        error: () => {
          this.error.set('Governance data could not be loaded. Check Azure access and try again.');
          this.finishLoading(tab);
        },
        complete: () => {
          this.finishLoading(tab);
        }
      });
  }

  /** Selects the active governance domain tab. */
  public selectTab(tab: GovernanceTab): void {
    this.activeTab.set(tab);
    if (tab === 'policies') {
      this.resetPolicyPaging();
    }
    this.refresh();
  }

  public changePolicyPage(change: {
    direction: 'next' | 'previous' | 'size';
    pageSize?: number;
  }): void {
    if (this.policyPageLoading()) {
      return;
    }

    const previousPageIndex = this.policyPageIndex();
    const previousPageSize = this.policyPageSize();
    const previousPageTokens = [...this.policyPageTokens];
    const previousFilters = this.policyFilters();
    let skipToken: string | undefined;
    if (change.direction === 'size') {
      if (!change.pageSize || ![30, 60, 100].includes(change.pageSize)) {
        return;
      }
      this.policyPageSize.set(change.pageSize);
      this.resetPolicyPaging();
    } else if (change.direction === 'next') {
      const nextToken = this.snapshot()?.policy.nextToken;
      if (!nextToken) {
        return;
      }
      const nextPage = this.policyPageIndex() + 1;
      this.policyPageTokens[nextPage] = nextToken;
      this.policyPageIndex.set(nextPage);
      skipToken = nextToken;
    } else {
      const previousPage = this.policyPageIndex() - 1;
      if (previousPage < 0) {
        return;
      }
      this.policyPageIndex.set(previousPage);
      skipToken = this.policyPageTokens[previousPage];
    }

    this.loadPolicyPage(skipToken, this.policyPageIndex(), {
      pageIndex: previousPageIndex,
      pageSize: previousPageSize,
      pageTokens: previousPageTokens,
      filters: previousFilters
    });
  }

  public applyPolicyFilters(filters: GovernancePolicyFilters): void {
    const previousState = {
      pageIndex: this.policyPageIndex(),
      pageSize: this.policyPageSize(),
      pageTokens: [...this.policyPageTokens],
      filters: this.policyFilters()
    };
    this.policyFilters.set(filters);
    this.resetPolicyPaging();
    this.loadPolicyPage(undefined, 0, previousState);
  }

  private loadPolicyPage(
    skipToken: string | undefined,
    pageIndex: number,
    previousState: {
      pageIndex: number;
      pageSize: number;
      pageTokens: Array<string | undefined>;
      filters: GovernancePolicyFilters;
    }
  ): void {
    this.policyPageLoading.set(true);
    this.governance.getPolicyViolationsPage(
      this.policyPageSize(),
      skipToken,
      this.policyFilters()
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const current = this.snapshot();
          if (current) {
            this.snapshot.set({
              ...current,
              policy: {
                ...current.policy,
                ...page,
                pageIndex,
                pageSize: this.policyPageSize()
              }
            });
          }
          this.policyPageLoading.set(false);
        },
        error: () => {
          this.policyPageIndex.set(previousState.pageIndex);
          this.policyPageSize.set(previousState.pageSize);
          this.policyPageTokens = previousState.pageTokens;
          this.policyFilters.set(previousState.filters);
          this.error.set('Policy violations could not be loaded. Try again.');
          this.policyPageLoading.set(false);
        }
      });
  }

  private resetPolicyPaging(): void {
    this.policyPageIndex.set(0);
    this.policyPageTokens = [undefined];
  }

  private finishLoading(tab: GovernanceTab): void {
    this.loadingTabs.delete(tab);
    this.loading.set(this.loadingTabs.size > 0);
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
