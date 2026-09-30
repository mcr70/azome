import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import {
  FileBrowserItem,
  FileShareItem,
  StorageAccountService
} from '../../../../../services/azure/storage-account.service';

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  shares: FileShareItem[] = [];
  items: FileBrowserItem[] = [];
  share = '';
  directory = '';
  loading = false;
  error = '';
  previewText = '';
  previewUrl = '';
  previewName = '';

  private readonly subs = new Subscription();
  private requestId = 0;

  constructor(private readonly storage: StorageAccountService) {}

  ngOnInit(): void {
    this.run(this.storage.listShares(this.resourceId), (shares) => {
      this.shares = shares;
      if (shares.length > 0) {
        this.selectShare(shares[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.clearPreview();
  }

  selectShare(name: string): void {
    this.share = name;
    this.directory = '';
    if (name) {
      this.load();
    } else {
      this.items = [];
    }
  }

  openFolder(item: FileBrowserItem): void {
    this.directory = item.path;
    this.load();
  }

  navigate(path: string): void {
    this.directory = path;
    this.load();
  }

  get crumbs(): Array<{ label: string; path: string }> {
    const parts = this.directory.split('/').filter(Boolean);
    return [
      { label: this.share, path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/')
      }))
    ];
  }

  canPreview(item: FileBrowserItem): boolean {
    return !item.isDirectory && this.isPreviewable(item.name, item.contentType);
  }

  preview(item: FileBrowserItem): void {
    if (!this.canPreview(item)) {
      return;
    }

    this.clearPreview();
    this.previewName = item.name;
    this.subs.add(this.storage.downloadFile(this.resourceId, this.share, item.path).subscribe({
      next: (blob) => this.showPreview(blob, item.name, item.contentType),
      error: (error) => this.error = this.message(error)
    }));
  }

  closePreview(): void {
    this.clearPreview();
  }

  download(item: FileBrowserItem): void {
    this.subs.add(this.storage.downloadFile(this.resourceId, this.share, item.path).subscribe({
      next: (blob) => this.save(blob, item.name),
      error: (error) => this.error = this.message(error)
    }));
  }

  private load(): void {
    this.run(
      this.storage.listFilesAndDirectories(this.resourceId, this.share, this.directory),
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
