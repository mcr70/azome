import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ArmApiService } from './arm-api.service';
import { StorageDataApiService } from './storage-data-api.service';
import { Observable, map, switchMap } from 'rxjs';

export interface BlobContainerItem {
  name: string;
  lastModified?: string;
}

export interface BlobBrowserItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  contentType?: string;
  lastModified?: string;
}

export interface FileShareItem {
  name: string;
}

export interface FileBrowserItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  contentType?: string;
  lastModified?: string;
}

export interface QueueItem {
  name: string;
}

export interface QueueMessage {
  id: string;
  insertionTime?: string;
  expirationTime?: string;
  dequeueCount?: number;
  text: string;
}

export interface TableItem {
  name: string;
}

export interface TableEntity {
  PartitionKey?: string;
  RowKey?: string;
  Timestamp?: string;
  [property: string]: unknown;
}

interface ArmList<T> {
  value?: T[];
}

@Injectable({ providedIn: 'root' })
export class StorageAccountService {
  constructor(
    private readonly armApi: ArmApiService,
    private readonly storageDataApi: StorageDataApiService
  ) {}

  /** Lists blob containers for a Storage Account. */
  public listContainers(id: string): Observable<BlobContainerItem[]> {
    return this.listArm<{
      name: string;
      properties?: { lastModifiedTime?: string };
    }>(id, 'blobServices/default/containers').pipe(
      map((items) => items.map((item) => ({
        name: item.name,
        lastModified: item.properties?.lastModifiedTime
      })))
    );
  }

  /** Lists file shares for a Storage Account. */
  public listShares(id: string): Observable<FileShareItem[]> {
    return this.listArm<{ name: string }>(id, 'fileServices/default/shares').pipe(
      map((items) => items.map((item) => ({ name: item.name })))
    );
  }

  /** Lists queues for a Storage Account. */
  public listQueues(id: string): Observable<QueueItem[]> {
    return this.listArm<{ name: string }>(id, 'queueServices/default/queues').pipe(
      map((items) => items.map((item) => ({ name: item.name })))
    );
  }

  /** Lists tables for a Storage Account. */
  public listTables(id: string): Observable<TableItem[]> {
    return this.listArm<{ name: string }>(id, 'tableServices/default/tables').pipe(
      map((items) => items.map((item) => ({ name: item.name })))
    );
  }

  /** Lists blobs and virtual folders under the given container prefix. */
  public listBlobs(
    id: string,
    container: string,
    prefix = ''
  ): Observable<BlobBrowserItem[]> {
    return this.storageDataApi.getServiceSas(id, 'blob', container).pipe(
      switchMap((sas) => {
        let params = new HttpParams({ fromString: sas })
          .set('restype', 'container')
          .set('comp', 'list')
          .set('delimiter', '/')
          .set('maxresults', '5000');

        if (prefix) {
          params = params.set('prefix', prefix);
        }

        const account = this.accountName(id);
        const path = '/' + encodeURIComponent(container);
          return this.xml(account, 'blob', path, params).pipe(
          map((xml) => {
            const folders = this.descendants(xml, 'BlobPrefix').map((folder) => {
              const path = this.text(folder, 'Name');
              return {
                name: path.slice(prefix.length).replace(/\/$/, ''),
                path,
                isDirectory: true
              };
            });
            const blobs = this.descendants(xml, 'Blob').map((blob) => {
              const path = this.text(blob, 'Name');
              const properties = this.child(blob, 'Properties');
              return {
                name: path.slice(prefix.length),
                path,
                isDirectory: false,
                size: Number(this.text(properties, 'Content-Length')) || 0,
                contentType: this.text(properties, 'Content-Type') || undefined,
                lastModified: this.text(properties, 'Last-Modified') || undefined
              };
            });

            return [...folders, ...blobs];
          })
        );
      })
    );
  }

  /** Downloads a blob using a short-lived service SAS token. */
  public downloadBlob(id: string, container: string, blobPath: string): Observable<Blob> {
    return this.storageDataApi.getServiceSas(id, 'blob', container).pipe(
      switchMap((sas) => this.storageDataApi.getBlob(
        this.accountName(id),
        'blob',
        '/' + encodeURIComponent(container) + '/' + this.encodePath(blobPath),
        new HttpParams({ fromString: sas }),
        { 'x-ms-version': '2023-11-03' }
      ))
    );
  }

  /** Lists files and directories under the given file share directory. */
  public listFilesAndDirectories(
    id: string,
    share: string,
    directory = ''
  ): Observable<FileBrowserItem[]> {
    return this.storageDataApi.getServiceSas(id, 'file', share).pipe(
      switchMap((sas) => {
        const path = [share, ...directory.split('/').filter(Boolean)]
          .map((part) => encodeURIComponent(part))
          .join('/');
        const params = new HttpParams({ fromString: sas })
          .set('restype', 'directory')
          .set('comp', 'list');

          return this.xml(this.accountName(id), 'file', '/' + path, params).pipe(
          map((xml) => {
            const folders = this.descendants(xml, 'Directory').map((item) => {
              const name = this.text(item, 'Name');
              return {
                name,
                path: [directory, name].filter(Boolean).join('/'),
                isDirectory: true
              };
            });
            const files = this.descendants(xml, 'File').map((item) => {
              const name = this.text(item, 'Name');
              const properties = this.child(item, 'Properties');
              return {
                name,
                path: [directory, name].filter(Boolean).join('/'),
                isDirectory: false,
                size: Number(this.text(properties, 'Content-Length')) || 0,
                contentType: this.text(properties, 'Content-Type') || undefined,
                lastModified: this.text(properties, 'Last-Modified') || undefined
              };
            });

            return [...folders, ...files];
          })
        );
      })
    );
  }

  /** Downloads a file using a short-lived service SAS token. */
  public downloadFile(id: string, share: string, filePath: string): Observable<Blob> {
    return this.storageDataApi.getServiceSas(id, 'file', share).pipe(
      switchMap((sas) => {
        const path = [share, ...filePath.split('/').filter(Boolean)]
          .map((part) => encodeURIComponent(part))
          .join('/');
        return this.storageDataApi.getBlob(
          this.accountName(id),
          'file',
          '/' + path,
          new HttpParams({ fromString: sas }),
          { 'x-ms-version': '2024-11-04' }
        );
      })
    );
  }

  /** Returns the approximate number of messages in a queue. */
  public getQueueMessageCount(id: string, queue: string): Observable<number> {
    return this.storageDataApi.getAccountSas(id, 'queue').pipe(
      switchMap((sas) => {
        const params = new HttpParams({ fromString: sas }).set('comp', 'metadata');
        return this.storageDataApi.getTextResponse(
          this.accountName(id),
          'queue',
          '/' + encodeURIComponent(queue),
          params,
          { 'x-ms-version': '2023-11-03' }
        ).pipe(
          map((response) => Number(
            response.headers.get('x-ms-approximate-messages-count')
          ) || 0)
        );
      })
    );
  }

  /** Peeks at messages in a queue without removing them. */
  public peekMessages(
    id: string,
    queue: string,
    count = 10
  ): Observable<QueueMessage[]> {
    return this.storageDataApi.getAccountSas(id, 'queue').pipe(
      switchMap((sas) => {
        const boundedCount = Math.min(Math.max(count, 1), 32);
        const params = new HttpParams({ fromString: sas })
          .set('peekonly', 'true')
          .set('numofmessages', String(boundedCount));
        const path = '/' + encodeURIComponent(queue) + '/messages';

          return this.xml(this.accountName(id), 'queue', path, params).pipe(
          map((xml) => this.descendants(xml, 'QueueMessage').map((message) => ({
            id: this.text(message, 'MessageId'),
            insertionTime: this.text(message, 'InsertionTime') || undefined,
            expirationTime: this.text(message, 'ExpirationTime') || undefined,
            dequeueCount: Number(this.text(message, 'DequeueCount')) || undefined,
            text: this.text(message, 'MessageText')
          })))
        );
      })
    );
  }

  /** Queries table entities using an optional OData filter. */
  public queryTableEntities(
    id: string,
    table: string,
    filter = ''
  ): Observable<TableEntity[]> {
    return this.storageDataApi.getAccountSas(id, 'table').pipe(
      switchMap((sas) => {
        let params = new HttpParams({ fromString: sas });
        if (filter.trim()) {
          params = params.set('$filter', filter.trim());
        }

        const path = '/' + encodeURIComponent(table) + '()';
        return this.storageDataApi.getJson<ArmList<TableEntity>>(
          this.accountName(id),
          'table',
          path,
          params,
          {
            Accept: 'application/json;odata=nometadata',
            'x-ms-version': '2019-02-02'
          }
        ).pipe(map((response) => response.value ?? []));
      })
    );
  }

  private listArm<T>(id: string, path: string): Observable<T[]> {
    return this.armApi.get<ArmList<T>>(`${id}/${path}`, {
      params: { 'api-version': '2023-01-01' }
    }).pipe(map((response) => response.value ?? []));
  }

  private xml(
    account: string,
    service: 'blob' | 'file' | 'queue',
    path: string,
    params: HttpParams
  ): Observable<XMLDocument> {
    const version = service === 'file' ? '2024-11-04' : '2023-11-03';
    return this.storageDataApi.getText(account, service, path, params, {
      'x-ms-version': version
    }).pipe(
      map((body) => {
        const xml = new DOMParser().parseFromString(body, 'application/xml');
        if (xml.getElementsByTagName('parsererror').length) {
          throw new Error('Azure Storage returned an invalid XML response.');
        }
        return xml;
      })
    );
  }

  private descendants(parent: ParentNode, name: string): Element[] {
    return Array.from(parent.querySelectorAll('*'))
      .filter((element) => element.localName === name);
  }

  private child(parent: ParentNode | null, name: string): Element | null {
    return parent
      ? Array.from(parent.children).find((element) => element.localName === name) ?? null
      : null;
  }

  private text(parent: ParentNode | null, name: string): string {
    return this.child(parent, name)?.textContent?.trim() ?? '';
  }

  private encodePath(path: string): string {
    return path
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  private accountName(id: string): string {
    const account = id.split('/').filter(Boolean).at(-1);
    if (!account) {
      throw new Error('Could not determine the Storage Account name from its ARM resource ID.');
    }
    return account;
  }
}
