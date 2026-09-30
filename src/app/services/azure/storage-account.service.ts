import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';

export interface BlobContainerItem { name: string; lastModified?: string; }
export interface BlobBrowserItem { name: string; path: string; isDirectory: boolean; size?: number; contentType?: string; lastModified?: string; }
export interface FileShareItem { name: string; }
export interface FileBrowserItem { name: string; path: string; isDirectory: boolean; size?: number; contentType?: string; lastModified?: string; }
export interface QueueItem { name: string; }
export interface QueueMessage { id: string; insertionTime?: string; expirationTime?: string; dequeueCount?: number; text: string; }
export interface TableItem { name: string; }
export interface TableEntity { PartitionKey?: string; RowKey?: string; Timestamp?: string; [property: string]: unknown; }
interface ArmList<T> { value?: T[]; }

@Injectable({ providedIn: 'root' })
export class StorageAccountService {
  private readonly apiVersion = '2023-01-01';
  constructor(private readonly http: HttpClient) {}

  public listContainers(id: string): Observable<BlobContainerItem[]> {
    return this.listArm<{ name: string; properties?: { lastModifiedTime?: string } }>(id, 'blobServices/default/containers')
      .pipe(map(items => items.map(item => ({ name: item.name, lastModified: item.properties?.lastModifiedTime }))));
  }
  public listShares(id: string): Observable<FileShareItem[]> {
    return this.listArm<{ name: string }>(id, 'fileServices/default/shares').pipe(map(items => items.map(item => ({ name: item.name }))));
  }
  public listQueues(id: string): Observable<QueueItem[]> {
    return this.listArm<{ name: string }>(id, 'queueServices/default/queues').pipe(map(items => items.map(item => ({ name: item.name }))));
  }
  public listTables(id: string): Observable<TableItem[]> {
    return this.listArm<{ name: string }>(id, 'tableServices/default/tables').pipe(map(items => items.map(item => ({ name: item.name }))));
  }

  public listBlobs(id: string, container: string, prefix = ''): Observable<BlobBrowserItem[]> {
    return this.sas(id, 'blob', container).pipe(switchMap(sas => {
      let params = new HttpParams({ fromString: sas }).set('restype', 'container').set('comp', 'list').set('delimiter', '/').set('maxresults', '5000');
      if (prefix) params = params.set('prefix', prefix);
      return this.xml(this.dataUrl(id, 'blob') + '/' + encodeURIComponent(container), params, 'blob').pipe(map(xml => {
        const folders = this.descendants(xml, 'BlobPrefix').map(folder => {
          const path = this.text(folder, 'Name');
          return { name: path.slice(prefix.length).replace(/\/$/, ''), path, isDirectory: true };
        });
        const blobs = this.descendants(xml, 'Blob').map(blob => {
          const path = this.text(blob, 'Name');
          const props = this.child(blob, 'Properties');
          return { name: path.slice(prefix.length), path, isDirectory: false, size: Number(this.text(props, 'Content-Length')) || 0,
            contentType: this.text(props, 'Content-Type') || undefined, lastModified: this.text(props, 'Last-Modified') || undefined };
        });
        return [...folders, ...blobs];
      }));
    }));
  }
  public downloadBlob(id: string, container: string, blobPath: string): Observable<Blob> {
    return this.sas(id, 'blob', container).pipe(switchMap(sas => this.http.get(
      this.dataUrl(id, 'blob') + '/' + encodeURIComponent(container) + '/' + this.encodePath(blobPath),
      { params: new HttpParams({ fromString: sas }), responseType: 'blob', headers: { 'x-ms-version': '2023-11-03' } }
    )));
  }
  public listFilesAndDirectories(id: string, share: string, directory = ''): Observable<FileBrowserItem[]> {
    return this.sas(id, 'file', share).pipe(switchMap(sas => {
      const path = [share, ...directory.split('/').filter(Boolean)].map(part => encodeURIComponent(part)).join('/');
      const params = new HttpParams({ fromString: sas }).set('restype', 'directory').set('comp', 'list');
      return this.xml(this.dataUrl(id, 'file') + '/' + path, params, 'file').pipe(map(xml => {
        const folders = this.descendants(xml, 'Directory').map(item => {
          const name = this.text(item, 'Name');
          return { name, path: [directory, name].filter(Boolean).join('/'), isDirectory: true };
        });
        const files = this.descendants(xml, 'File').map(item => {
          const name = this.text(item, 'Name');
          const props = this.child(item, 'Properties');
          return {
            name,
            path: [directory, name].filter(Boolean).join('/'),
            isDirectory: false,
            size: Number(this.text(props, 'Content-Length')) || 0,
            contentType: this.text(props, 'Content-Type') || undefined,
            lastModified: this.text(props, 'Last-Modified') || undefined
          };
        });
        return [...folders, ...files];
      }));
    }));
  }
  public downloadFile(id: string, share: string, filePath: string): Observable<Blob> {
    return this.sas(id, 'file', share).pipe(switchMap(sas => {
      const path = [share, ...filePath.split('/').filter(Boolean)].map(part => encodeURIComponent(part)).join('/');
      return this.http.get(this.dataUrl(id, 'file') + '/' + path, { params: new HttpParams({ fromString: sas }), responseType: 'blob', headers: { 'x-ms-version': '2024-11-04' } });
    }));
  }
  public getQueueMessageCount(id: string, queue: string): Observable<number> {
    return this.sas(id, 'queue').pipe(switchMap(sas => {
      const params = new HttpParams({ fromString: sas }).set('comp', 'metadata');
      return this.http.get(this.dataUrl(id, 'queue') + '/' + encodeURIComponent(queue), { params, observe: 'response', responseType: 'text', headers: { 'x-ms-version': '2023-11-03' } })
        .pipe(map(response => Number(response.headers.get('x-ms-approximate-messages-count')) || 0));
    }));
  }
  public peekMessages(id: string, queue: string, count = 10): Observable<QueueMessage[]> {
    return this.sas(id, 'queue').pipe(switchMap(sas => {
      const params = new HttpParams({ fromString: sas }).set('peekonly', 'true').set('numofmessages', String(Math.min(Math.max(count, 1), 32)));
      return this.xml(this.dataUrl(id, 'queue') + '/' + encodeURIComponent(queue) + '/messages', params, 'queue').pipe(map(xml =>
        this.descendants(xml, 'QueueMessage').map(message => ({
          id: this.text(message, 'MessageId'), insertionTime: this.text(message, 'InsertionTime') || undefined,
          expirationTime: this.text(message, 'ExpirationTime') || undefined, dequeueCount: Number(this.text(message, 'DequeueCount')) || undefined,
          text: this.text(message, 'MessageText')
        }))
      ));
    }));
  }
  public queryTableEntities(id: string, table: string, filter = ''): Observable<TableEntity[]> {
    return this.sas(id, 'table').pipe(switchMap(sas => {
      let params = new HttpParams({ fromString: sas });
      if (filter.trim()) params = params.set('$filter', filter.trim());
      return this.http.get<ArmList<TableEntity>>(this.dataUrl(id, 'table') + '/' + encodeURIComponent(table) + '()', {
        params, headers: { Accept: 'application/json;odata=nometadata', 'x-ms-version': '2019-02-02' }
      }).pipe(map(response => response.value ?? []));
    }));
  }

  private listArm<T>(id: string, path: string): Observable<T[]> {
    return this.http.get<ArmList<T>>(this.armUrl(id) + '/' + path + '?api-version=' + this.apiVersion).pipe(map(response => response.value ?? []));
  }
  private sas(id: string, service: 'blob' | 'file' | 'queue' | 'table', resourceName?: string): Observable<string> {
    const account = id.split('/').pop();
    if (!account) throw new Error('Could not determine the Storage Account name from its ARM resource ID.');
    const signedExpiry = new Date(Date.now() + 5 * 60_000).toISOString();
    if ((service === 'blob' || service === 'file') && resourceName) {
      const signedResource = service === 'blob' ? 'c' : 's';
      const canonicalizedResource = '/' + service + '/' + account + '/' + resourceName;
      return this.http.post<{ serviceSasToken?: string }>(this.armUrl(id) + '/listServiceSas?api-version=' + this.apiVersion, {
        canonicalizedResource, signedResource, signedPermission: 'rl', signedProtocol: 'https', signedExpiry
      }).pipe(map(response => {
        if (!response.serviceSasToken) throw new Error('Azure Resource Manager did not return a Storage service SAS token.');
        return response.serviceSasToken.replace(/^\?/, '');
      }));
    }
    const signedServices = service === 'queue' ? 'q' : 't';
    const signedPermission = 'r';
    return this.http.post<{ accountSasToken?: string }>(this.armUrl(id) + '/listAccountSas?api-version=' + this.apiVersion, {
      signedServices, signedResourceTypes: 'sco', signedPermission, signedProtocol: 'https',
      signedStart: new Date(Date.now() - 300000).toISOString(), signedExpiry, keyToSign: 'key1'
    }).pipe(map(response => {
      if (!response.accountSasToken) throw new Error('Azure Resource Manager did not return a Storage account SAS token.');
      return response.accountSasToken.replace(/^\?/, '');
    }));
  }
  private armUrl(id: string): string {
    if (!id?.startsWith('/subscriptions/')) throw new Error('The Storage Account ARM resource ID is missing or invalid.');
    return 'https://management.azure.com' + id.replace(/\/$/, '');
  }
  private dataUrl(id: string, service: 'blob' | 'file' | 'queue' | 'table'): string {
    const account = id.split('/').pop();
    if (!account) throw new Error('Could not determine the Storage Account name from its ARM resource ID.');
    return '/storage-proxy/' + account + '/' + service;
  }
  private xml(url: string, params: HttpParams, service: 'blob' | 'file' | 'queue'): Observable<XMLDocument> {
    const version = service === 'file' ? '2024-11-04' : '2023-11-03';
    return this.http.get(url, { params, responseType: 'text', headers: { 'x-ms-version': version } }).pipe(map(body => {
      const xml = new DOMParser().parseFromString(body, 'application/xml');
      if (xml.getElementsByTagName('parsererror').length) throw new Error('Azure Storage returned an invalid XML response.');
      return xml;
    }));
  }
  private descendants(parent: ParentNode, name: string): Element[] {
    return Array.from(parent.querySelectorAll('*')).filter(element => element.localName === name);
  }
  private child(parent: ParentNode | null, name: string): Element | null {
    return parent ? Array.from(parent.children).find(element => element.localName === name) ?? null : null;
  }
  private text(parent: ParentNode | null, name: string): string { return this.child(parent, name)?.textContent?.trim() ?? ''; }
  private encodePath(path: string): string { return path.split('/').filter(Boolean).map(part => encodeURIComponent(part)).join('/'); }
}
