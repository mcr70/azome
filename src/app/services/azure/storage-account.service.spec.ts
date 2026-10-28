import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { StorageAccountService } from './storage-account.service';

describe('StorageAccountService API delegation', () => {
  let service: StorageAccountService;
  let http: HttpTestingController;
  const resourceId = '/subscriptions/subscription/resourceGroups/group'
    + '/providers/Microsoft.Storage/storageAccounts/testaccount';
  const proxyUrl = 'https://proxy.example.com';
  let originalProxyUrl: string;

  beforeEach(() => {
    originalProxyUrl = environment.azure.proxyUrl;
    environment.azure.proxyUrl = proxyUrl;
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(StorageAccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    environment.azure.proxyUrl = originalProxyUrl;
  });

  it('uses a read-only service SAS for blob downloads', () => {
    let download: Blob | undefined;
    service.downloadBlob(resourceId, 'documents', 'folder/report.csv')
      .subscribe((blob) => download = blob);

    const sasRequest = http.expectOne(
      'https://management.azure.com' + resourceId
        + '/listServiceSas?api-version=2023-01-01'
    );
    expect(sasRequest.request.method).toBe('POST');
    expect(sasRequest.request.body.signedPermission).toBe('rl');
    expect(sasRequest.request.body.signedProtocol).toBe('https');
    sasRequest.flush({ serviceSasToken: '?sv=test&sp=rl' });

    const dataRequest = http.expectOne((request) =>
      request.url === `${proxyUrl}/storage-proxy/testaccount/blob/documents/folder/report.csv`
    );
    expect(dataRequest.request.method).toBe('GET');
    expect(dataRequest.request.params.get('sp')).toBe('rl');
    expect(dataRequest.request.headers.get('x-ms-version')).toBe('2023-11-03');
    dataRequest.flush(new Blob(['report']));

    expect(download).toEqual(new Blob(['report']));
  });

  it('uses a read-only account SAS for queue metadata', () => {
    let messageCount: number | undefined;
    service.getQueueMessageCount(resourceId, 'jobs').subscribe((count) => messageCount = count);

    const sasRequest = http.expectOne(
      'https://management.azure.com' + resourceId
        + '/listAccountSas?api-version=2023-01-01'
    );
    expect(sasRequest.request.body.signedServices).toBe('q');
    expect(sasRequest.request.body.signedResourceTypes).toBe('sco');
    expect(sasRequest.request.body.signedPermission).toBe('r');
    sasRequest.flush({ accountSasToken: '?sv=test&sp=r' });

    const dataRequest = http.expectOne((request) =>
      request.url === `${proxyUrl}/storage-proxy/testaccount/queue/jobs`
    );
    expect(dataRequest.request.params.get('comp')).toBe('metadata');
    dataRequest.flush('', {
      headers: new HttpHeaders({ 'x-ms-approximate-messages-count': '7' })
    });

    expect(messageCount).toBe(7);
  });
});