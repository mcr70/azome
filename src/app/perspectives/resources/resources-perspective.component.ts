import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import { ResourceGroupListComponent } from './resource-group-list.component';
import { ResourceSelectionBarComponent } from '../../components/resource-selection-bar.component';
import { selectFloatingPanel, selectPinnedPanels } from '../perspective-utils';

/**
 * Resources perspective shell.
 *
 * Hosts the resource group list inside the shared perspective layout and owns
 * the pinned and floating resource detail panels like the other perspectives.
 */
@Component({
  selector: 'app-resources-perspective',
  standalone: true,
  imports: [
    ResourceGroupListComponent,
    ResourceSelectionBarComponent,
    ResourceDetailPaneComponent
  ],
  templateUrl: './resources-perspective.component.html',
  styleUrls: ['../perspective-shared.scss', './resources-perspective.component.scss']
})
export class ResourcesPerspectiveComponent implements OnInit, OnDestroy {
  public panels: ResourcePanelConfig[] = [];

  /**
   * Loading state mirrored from the resource group list. Starts as true
   * because the list begins loading immediately on init.
   */
  public listLoading = true;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly panelService: ResourceDetailPanelService) {}

  /** Mirrors the shared panel state into the perspective layout. */
  public ngOnInit(): void {
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Panels pinned into the side-by-side slots. */
  public get pinnedPanels(): ResourcePanelConfig[] {
    return selectPinnedPanels(this.panels);
  }

  /** The floating resource details panel, if one is open. */
  public get floatingPanel(): ResourcePanelConfig | null {
    return selectFloatingPanel(this.panels);
  }

  /**
   * Closes a resource details panel.
   *
   * @param panelId Identifier of the panel to close.
   */
  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  /**
   * Changes the pinned state of a resource details panel.
   *
   * @param panelId Identifier of the panel to pin or unpin.
   */
  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }
}
