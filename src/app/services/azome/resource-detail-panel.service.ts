import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AzureResourceDetail } from '../azure/resource-graph.service';

export interface ResourcePanelConfig {
  id: string;
  resource: AzureResourceDetail;
  pinned: boolean;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class ResourceDetailPanelService {
  private readonly panelsSubject = new BehaviorSubject<ResourcePanelConfig[]>([]);
  public readonly panels$ = this.panelsSubject.asObservable();

  public get activePanels(): ResourcePanelConfig[] {
    return this.panelsSubject.value;
  }

  public openPanel(resource: AzureResourceDetail, pin = false): string {
    const panels = [...this.activePanels];
    const unpinned = panels.find((panel) => !panel.pinned);
    if (!pin && unpinned) {
      this.publish(panels.map((panel) => panel.id === unpinned.id ? { ...panel, resource } : panel));
      return unpinned.id;
    }

    if (!pin && panels.length === 1 && panels[0].pinned) pin = true;

    if (!pin && panels.length >= 2) {
      const oldest = panels.filter((panel) => panel.pinned).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) {
        this.publish(panels.map((panel) => panel.id === oldest.id ? { ...panel, resource } : panel));
        return oldest.id;
      }
    }

    const panel: ResourcePanelConfig = {
      id: this.createId(),
      resource,
      pinned: pin,
      createdAt: Date.now()
    };

    if (pin) {
      const pinned = panels.filter((current) => current.pinned).sort((a, b) => a.createdAt - b.createdAt);
      if (pinned.length >= 2) {
        const oldestId = pinned[0].id;
        this.publish(panels.map((current) => current.id === oldestId ? panel : current));
        return panel.id;
      }
      if (unpinned) {
        this.publish(panels.map((current) => current.id === unpinned.id ? panel : current));
        return panel.id;
      }
    }

    this.publish([...panels, panel]);
    return panel.id;
  }

  public togglePin(panelId: string): void {
    const panels = [...this.activePanels];
    const target = panels.find((panel) => panel.id === panelId);
    if (!target) return;

    if (target.pinned) {
      const existingUnpinned = panels.find((panel) => !panel.pinned);
      const next = panels
        .filter((panel) => panel.id !== target.id && panel.id !== existingUnpinned?.id)
        .concat({ ...target, pinned: false, createdAt: Date.now() });
      this.publish(next);
      return;
    }

    const pinned = panels.filter((panel) => panel.pinned).sort((a, b) => a.createdAt - b.createdAt);
    let next = panels.filter((panel) => panel.id !== target.id);
    if (pinned.length >= 2) {
      const oldestId = pinned[0].id;
      next = next.filter((panel) => panel.id !== oldestId);
    }
    this.publish([...next, { ...target, pinned: true, createdAt: Date.now() }]);
  }

  public duplicatePanel(panelId: string): void {
    let source = this.activePanels.find((panel) => panel.id === panelId);
    if (!source || this.activePanels.length >= 2) return;
    if (!source.pinned) {
      this.togglePin(panelId);
      source = this.activePanels.find((panel) => panel.id === panelId);
    }
    if (!source || this.activePanels.filter((panel) => panel.pinned).length >= 2) return;

    const panel: ResourcePanelConfig = {
      ...source,
      id: this.createId(),
      pinned: true,
      createdAt: Date.now()
    };
    this.publish([...this.activePanels, panel]);
  }

  public closePanel(panelId: string): void {
    this.publish(this.activePanels.filter((panel) => panel.id !== panelId));
  }

  private publish(panels: ResourcePanelConfig[]): void {
    this.panelsSubject.next(panels);
  }

  private createId(): string {
    return `resource-panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
