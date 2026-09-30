import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlobBrowserComponent } from './blob-browser/blob-browser.component';
import { FileBrowserComponent } from './file-browser/file-browser.component';
import { QueueBrowserComponent } from './queue-browser/queue-browser.component';
import { TableBrowserComponent } from './table-browser/table-browser.component';

@Component({
  selector: 'app-storage-account-browser',
  standalone: true,
  imports: [CommonModule, BlobBrowserComponent, FileBrowserComponent, QueueBrowserComponent, TableBrowserComponent],
  templateUrl: './storage-account-browser.component.html',
  styleUrl: './storage-account-browser.component.scss'
})
export class StorageAccountBrowserComponent {
  @Input({ required: true }) resourceId = '';

  activeService: 'blobs' | 'files' | 'queues' | 'tables' = 'blobs';

  /** Selects the Storage service shown in the browser. */
  selectService(service: 'blobs' | 'files' | 'queues' | 'tables'): void {
    this.activeService = service;
  }
}
