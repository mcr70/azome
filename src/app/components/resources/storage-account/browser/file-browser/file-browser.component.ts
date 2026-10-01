import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import {
  FileBrowserItem,
  FileShareItem,
  StorageAccountService
} from '../../../../../services/azure/storage-account.service';
import { StorageBrowserBase } from '../storage-browser-base';

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class FileBrowserComponent extends StorageBrowserBase implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  shares: FileShareItem[] = [];
  items: FileBrowserItem[] = [];
  share = '';
  directory = '';
  previewText = '';
  previewUrl = '';
  previewName = '';

  constructor(private readonly storage: StorageAccountService) {
    super();
  }

  ngOnInit(): void {
    this.run(this.storage.listShares(this.resourceId), (shares) => {
      this.shares = shares;
      if (shares.length > 0) {
        this.selectShare(shares[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.dispose();
    this.clearPreview();
  }

  /** Selects a file share and loads its root entries. */
  selectShare(name: string): void {
    this.share = name;
    this.directory = '';
    if (name) {
      this.load();
    } else {
      this.items = [];
    }
  }

  /** Opens a directory inside the selected file share. */
  openFolder(item: FileBrowserItem): void {
    this.directory = item.path;
    this.load();
  }

  /** Navigates to a share or directory breadcrumb. */
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

  /** Reports whether the file type can be rendered in the preview panel. */
  canPreview(item: FileBrowserItem): boolean {
    return !item.isDirectory && this.isPreviewable(item.name, item.contentType);
  }

  /** Opens a preview for a supported file. */
  preview(item: FileBrowserItem): void {
    if (!this.canPreview(item)) {
      return;
    }

    this.clearPreview();
    this.previewName = item.name;
    this.track(this.storage.downloadFile(this.resourceId, this.share, item.path).subscribe({
      next: (blob) => this.showPreview(blob, item.name, item.contentType),
      error: (error) => this.error = this.message(error)
    }));
  }

  /** Closes the file preview panel. */
  closePreview(): void {
    this.clearPreview();
  }

  /** Downloads the selected file to the local device. */
  download(item: FileBrowserItem): void {
    this.track(this.storage.downloadFile(this.resourceId, this.share, item.path).subscribe({
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
