/** Coordinates loading and presentation of subscription governance summaries. */
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  GovernanceService,
  GovernanceSnapshot
} from '@services/azure/governance.service';
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
    GovernanceTagsCardComponent
  ],
  templateUrl: './governance-view.component.html',
  styleUrl: './governance-view.component.scss'
})
export class GovernanceViewComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly governance = inject(GovernanceService);

  public readonly snapshot = signal<GovernanceSnapshot | null>(null);
  public readonly loading = signal(false);
  public readonly error = signal<string | null>(null);

  /** Loads the dashboard once when the perspective becomes active. */
  public ngOnInit(): void {
    this.refresh();
  }

  /** Refreshes all independently available governance data sources. */
  public refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.governance.getSnapshot()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.snapshot.set(snapshot);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Governance data could not be loaded. Check Azure access and try again.');
          this.loading.set(false);
        }
      });
  }
}
