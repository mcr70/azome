import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import {
  BlobBrowserItem,
  BlobContainerItem,
  StorageAccountService
} from '../../../../../services/azure/storage-account.service';

@Component({
  selector: 'app-blob-browser',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './blob-browser.component.html',
  styleUrl: './storage-browser.component.scss'
})
export class BlobBrowserComponent implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  containers: BlobContainerItem[] = [];
  items: BlobBrowserItem[] = [];
  container = '';
  prefix = '';
  loading = false;
  error = '';
  previewText = '';
  previewUrl = '';
  previewName = '';

  private readonly subs = new Subscription();
  private requestId = 0;

  constructor(private readonly storage: StorageAccountService) {}

  ngOnInit(): void {
    this.run(this.storage.listContainers(this.resourceId), (containers) => {
      this.containers = containers;
      if (containers.length > 0) {
        this.selectContainer(containers[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.clearPreview();
  }

  selectContainer(name: string): void {
    this.container = name;
    this.prefix = '';
    if (name) {
      this.load();
    } else {
      this.items = [];
    }
  }

  openFolder(item: BlobBrowserItem): void {
    this.prefix = item.path;
    this.load();
  }

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

  canPreview(item: BlobBrowserItem): boolean {
    return !item.isDirectory && this.isPreviewable(item.name, item.contentType);
  }

  preview(item: BlobBrowserItem): void {
    if (!this.canPreview(item)) {
      return;
    }

    this.clearPreview();
    this.previewName = item.name;
    this.subs.add(this.storage.downloadBlob(this.resourceId, this.container, item.path).subscribe({
      next: (blob) => this.showPreview(blob, item.name, item.contentType),
      error: (error) => this.error = this.message(error)
    }));
  }

  download(item: BlobBrowserItem): void {
    this.subs.add(this.storage.downloadBlob(this.resourceId, this.container, item.path).subscribe({
      next: (blob) => this.save(blob, item.name),
      error: (error) => this.error = this.message(error)
    }));
  }

  closePreview(): void {
    this.clearPreview();
  }

  private load(): void {
    this.run(
      this.storage.listBlobs(this.resourceId, this.container, this.prefix),
      (items) => this.items = items
    );
  }

  private run<T>(request: Observable<T>, accept: (value: T) => void): void {
    const requestId = ++this.requestId;
    this.loading = true;
    this.error = '';
    this.subs.add(request.subscribe({
      next: (value) => accept(value),
      error: (error) => {
        this.error = this.message(error);
        this.loading = false;
      },
      complete: () => {
        if (requestId === this.requestId) {
          this.loading = false;
        }
      }
    }));
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

  private message(error: any): string {
    return error?.error?.error?.message
      || error?.error?.message
      || error?.message
      || 'Storage request failed.';
  }
}
