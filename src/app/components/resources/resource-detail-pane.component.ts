import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AzureResourceDetail } from '../../services/azure/resource-graph.service';
import { ResourcePanelConfig } from '../../services/azome/resource-detail-panel.service';
import { ResourceDetailRegistryService } from '../../services/azome/resource-detail.registry';
import { DetailsPanelComponent } from '../details-panel/details-panel.component';
import { ResourceDetailHostComponent } from './resource-detail-host.component';

@Component({
  selector: 'app-resource-detail-pane',
  standalone: true,
  imports: [CommonModule, DetailsPanelComponent, ResourceDetailHostComponent],
  templateUrl: './resource-detail-pane.component.html',
  styleUrl: './resource-detail-pane.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ResourceDetailPaneComponent implements OnChanges {
  @Input({ required: true }) panel!: ResourcePanelConfig;
  @Input() pinned = false;
  @Output() close = new EventEmitter<string>();
  @Output() togglePin = new EventEmitter<string>();

  public view: 'overview' | 'browse' | 'json' = 'overview';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['panel']) this.view = 'overview';
  }

  constructor(private readonly registry: ResourceDetailRegistryService) {}

  public get resource(): AzureResourceDetail {
    return this.panel.resource;
  }

  public get title(): string {
    return this.resource.name;
  }

  public get subtitle(): string {
    const type = this.resource.type || 'Resource';
    return type.split('/').pop() || type;
  }

  public get variant(): 'default' | 'wide' | 'content' {
    const component = this.registry.getComponent(this.resource.type);
    return component?.preferredVariant || 'default';
  }

  public get isStorageAccount(): boolean {
    return this.resource.type?.toLowerCase() === 'microsoft.storage/storageaccounts';
  }

  public setView(view: 'overview' | 'browse' | 'json', detailHost: ResourceDetailHostComponent): void {
    this.view = view;
    if (view !== 'json') detailHost.setTab(view);
  }
}
