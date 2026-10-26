import { environment, loadRuntimeConfig, parseRuntimeConfig, RuntimeConfig } from './runtime-config';

describe('Runtime configuration', () => {
  let config: RuntimeConfig;
  let original: RuntimeConfig;

  beforeEach(() => {
    original = { ...environment, azure: { ...environment.azure } };
    config = {
      production: false,
      azure: {
        clientId: '11111111-1111-1111-1111-111111111111',
        subscriptionId: '22222222-2222-2222-2222-222222222222',
        tenantId: '33333333-3333-3333-3333-333333333333',
        resourceManagerUrl: 'https://management.azure.com',
        proxyUrl: '',
        apiVersion: '2021-04-01'
      }
    };
  });

  afterEach(() => {
    environment.production = original.production;
    Object.assign(environment.azure, original.azure);
  });

  it('keeps local data-plane requests on the Angular development origin', () => {
    expect(parseRuntimeConfig(config)).toEqual(config);
  });

  it('normalizes an Azure proxy origin for all data-plane services', () => {
    config.production = true;
    config.azure.proxyUrl = 'https://example.azurewebsites.net/';

    expect(parseRuntimeConfig(config).azure.proxyUrl).toBe('https://example.azurewebsites.net');
  });

  it('allows an explicitly configured local HTTP proxy only outside production', () => {
    config.azure.proxyUrl = 'http://127.0.0.1:4201';
    expect(parseRuntimeConfig(config).azure.proxyUrl).toBe('http://127.0.0.1:4201');

    config.production = true;
    expect(() => parseRuntimeConfig(config)).toThrowError(/HTTPS origin/);
  });

  it('rejects missing configuration instead of using development defaults', () => {
    for (const value of [null, [], {}, { production: true }, '<html>Not found</html>']) {
      expect(() => parseRuntimeConfig(value)).toThrowError(/Invalid app-config.json/);
    }
  });

  it('rejects invalid identity settings', () => {
    for (const field of ['clientId', 'subscriptionId', 'tenantId'] as const) {
      const invalid = { ...config, azure: { ...config.azure, [field]: 'placeholder' } };
      expect(() => parseRuntimeConfig(invalid)).toThrowError(new RegExp(field));
    }
  });

  it('rejects missing proxy settings, remote HTTP and origins containing paths or credentials', () => {
    for (const proxyUrl of [
      undefined,
      'http://example.com',
      'https://example.com/path',
      'https://user:password@example.com',
      'https://example.com/?key=value',
      'https://example.com/#fragment'
    ]) {
      const invalid = { ...config, azure: { ...config.azure, proxyUrl } };
      expect(() => parseRuntimeConfig(invalid)).toThrowError();
    }
  });

  it('rejects invalid API versions', () => {
    config.azure.apiVersion = '';
    expect(() => parseRuntimeConfig(config)).toThrowError(/apiVersion/);
  });

  it('loads fresh runtime JSON before it is used by application services', async () => {
    config.production = true;
    config.azure.proxyUrl = 'https://example.azurewebsites.net';
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response(JSON.stringify(config)));
    const azure = environment.azure;

    await loadRuntimeConfig();

    expect(fetchSpy).toHaveBeenCalledOnceWith(new URL('app-config.json', document.baseURI), {
      cache: 'no-store'
    });
    expect(environment).toEqual(config);
    expect(environment.azure).toBe(azure);
  });

  it('propagates missing-file errors without changing configuration', async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 404 }));

    await expectAsync(loadRuntimeConfig()).toBeRejectedWithError(
      'Failed to load app-config.json (HTTP 404).'
      + ' Ensure the configuration file exists and restart ng serve after changing angular.json.'
    );
    expect(environment).toEqual(original);
  });

  it('reports other HTTP errors without suggesting a development-server restart', async () => {
    spyOn(window, 'fetch').and.resolveTo(new Response('', { status: 503 }));

    await expectAsync(loadRuntimeConfig()).toBeRejectedWithError(
      'Failed to load app-config.json (HTTP 503).'
    );
    expect(environment).toEqual(original);
  });

  it('propagates invalid JSON and network failures without changing configuration', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response('<html>SPA fallback</html>'));
    await expectAsync(loadRuntimeConfig()).toBeRejected();
    expect(environment).toEqual(original);

    fetchSpy.and.rejectWith(new TypeError('Network unavailable'));
    await expectAsync(loadRuntimeConfig()).toBeRejectedWithError(/Network unavailable/);
    expect(environment).toEqual(original);
  });
});
