import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { AzureResourceDetail } from '@services/azure/resource-graph.service';
import {
  ResourceDetailComponentType,
  ResourceDetailRegistryService
} from '@services/azome/resource-detail.registry';
import { LucideDynamicIcon, LucideX } from '@lucide/angular';

/**
 * Hosts the data-plane browser of a resource inside a centered modal dialog. The
 * concrete browser component is resolved from the resource detail registry.
 */
@Component({
  selector: 'app-data-browse-pane',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './data-browse-pane.component.html',
  styleUrls: ['./data-browse-pane.component.scss']
})
export class DataBrowsePaneComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) resource!: AzureResourceDetail;
  @Output() close = new EventEmitter<void>();
  @ViewChild('dialog') private dialog!: ElementRef<HTMLDialogElement>;

  public readonly closeIcon = LucideX.icon;

  constructor(private readonly registry: ResourceDetailRegistryService) {}

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
  }

  ngOnDestroy(): void {
    this.dialog?.nativeElement.close();
  }

  /** Browser component registered for the resource type, if any. */
  public get browserComponent(): ResourceDetailComponentType | null {
    return this.registry.getComponent(this.resource.type);
  }
}