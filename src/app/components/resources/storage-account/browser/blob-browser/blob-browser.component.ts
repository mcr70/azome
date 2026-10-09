import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { LucideDownload, LucideDynamicIcon } from '@lucide/angular';
import {
  BlobBrowserItem,
  BlobContainerItem,
  StorageAccountService
} from '@services/azure/storage-account.service';
import { StorageBrowserBase } from '../storage-browser-base';

@Component({
  selector: 'app-blob-browser',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './blob-browser.component.html',
  styleUrl: './storage-browser.component.scss'
})
export class BlobBrowserComponent extends StorageBrowserBase implements OnInit, OnDestroy {
  readonly downloadIcon = LucideDownload.icon;

  @Input({ required: true }) resourceId = '';

  containers: BlobContainerItem[] = [];
  items: BlobBrowserItem[] = [];
  container = '';
  prefix = '';
  previewText = '';
  previewUrl = '';
  previewName = '';

  constructor(private readonly storage: StorageAccountService) {
    super();
  }

  ngOnInit(): void {
    this.run(this.storage.listContainers(this.resourceId), (containers) => {
      this.containers = containers;
      if (containers.length > 0) {
        this.selectContainer(containers[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.dispose();
    this.clearPreview();
  }

  /** Selects a blob container and loads its root entries. */
  selectContainer(name: string): void {
    this.container = name;
    this.prefix = '';
    if (name) {
      this.load();
    } else {
      this.items = [];
    }
  }

  /** Opens a virtual folder inside the selected container. */
  openFolder(item: BlobBrowserItem): void {
    this.prefix = item.path;
    this.load();
  }

  /** Navigates to a container or folder breadcrumb. */
  navigate(prefix: string): void {
    this.prefix = prefix;
    this.load();
  }

  get crumbs(): Array<{ label: string; prefix: string }> {
    const parts = this.prefix.split('/').filter(Boolean);
    return [
      { label: this.container, prefix: '' },
      ...parts.map((part, index) => ({
        label: part,
        prefix: parts.slice(0, index + 1).join('/') + '/'
      }))
    ];
  }

  /** Reports whether the file type can be rendered in the preview panel. */
  canPreview(item: BlobBrowserItem): boolean {
    return !item.isDirectory && this.isPreviewable(item.name, item.contentType);
  }

  /** Opens a preview for a supported blob. */
  preview(item: BlobBrowserItem): void {
    if (!this.canPreview(item)) {
      return;
    }

    this.clearPreview();
    this.previewName = item.name;
    this.track(this.storage.downloadBlob(this.resourceId, this.container, item.path).subscribe({
      next: (blob) => this.showPreview(blob, item.name, item.contentType),
      error: (error) => this.error = this.message(error)
    }));
  }

  /** Downloads the selected blob to the local device. */
  download(item: BlobBrowserItem): void {
    this.track(this.storage.downloadBlob(this.resourceId, this.container, item.path).subscribe({
      next: (blob) => this.save(blob, item.name),
      error: (error) => this.error = this.message(error)
    }));
  }

  /** Closes the blob preview panel. */
  closePreview(): void {
    this.clearPreview();
  }

  private load(): void {
    this.run(
      this.storage.listBlobs(this.resourceId, this.container, this.prefix),
      (items) => this.items = items
    );
  }

  private isPreviewable(name: string, contentType?: string): boolean {
    const normalizedType = contentType?.split(';')[0].trim().toLowerCase() ?? '';
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const supportedExtensions = [
      'json', 'tfstate', 'xml', 'log', 'txt', 'csv', 'md',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
    ];

    return supportedExtensions.includes(extension)
      || normalizedType.startsWith('text/')
      || normalizedType.startsWith('image/')
      || normalizedType === 'application/json'
      || normalizedType === 'application/xml'
      || normalizedType.endsWith('+json')
      || normalizedType.endsWith('+xml');
  }

  private showPreview(blob: Blob, name: string, contentType?: string): void {
    const normalizedType = contentType?.split(';')[0].trim().toLowerCase() ?? blob.type;
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = normalizedType.startsWith('image/')
      || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension);

    if (isImage) {
      this.previewUrl = URL.createObjectURL(blob);
      return;
    }

    blob.text().then((text) => this.previewText = text);
  }

  private clearPreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = '';
    this.previewText = '';
    this.previewName = '';
  }

  private save(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
}
