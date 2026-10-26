export interface RuntimeConfig {
  production: boolean;
  azure: {
    clientId: string;
    subscriptionId: string;
    tenantId: string;
    resourceManagerUrl: string;
    proxyUrl: string;
    apiVersion: string;
  };
}

export const environment: RuntimeConfig = {
  production: false,
  azure: {
    clientId: '',
    subscriptionId: '',
    tenantId: '',
    resourceManagerUrl: 'https://management.azure.com',
    proxyUrl: '',
    apiVersion: '2021-04-01'
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireGuid(value: unknown, name: string): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid app-config.json: azure.${name} must be a GUID.`);
  }

  return value;
}

function requireOrigin(value: unknown, name: string, allowLocalHttp = false): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid app-config.json: azure.${name} must be a URL origin.`);
  }

  const url = new URL(value);
  const localHttp = allowLocalHttp && url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

  if ((url.protocol !== 'https:' && !localHttp)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`Invalid app-config.json: azure.${name} must be an HTTPS origin.`);
  }

  return url.origin;
}

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  if (!isRecord(value) || typeof value['production'] !== 'boolean' || !isRecord(value['azure'])) {
    throw new Error('Invalid app-config.json: production and azure settings are required.');
  }

  const azure = value['azure'];
  const apiVersion = azure['apiVersion'];

  if (typeof apiVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}(-preview)?$/.test(apiVersion)) {
    throw new Error('Invalid app-config.json: azure.apiVersion must be an Azure API version.');
  }

  return {
    production: value['production'],
    azure: {
      clientId: requireGuid(azure['clientId'], 'clientId'),
      subscriptionId: requireGuid(azure['subscriptionId'], 'subscriptionId'),
      tenantId: requireGuid(azure['tenantId'], 'tenantId'),
      resourceManagerUrl: requireOrigin(azure['resourceManagerUrl'], 'resourceManagerUrl'),
      proxyUrl: azure['proxyUrl'] === ''
        ? ''
        : requireOrigin(azure['proxyUrl'], 'proxyUrl', !value['production']),
      apiVersion
    }
  };
}

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch(new URL('app-config.json', document.baseURI), {
    cache: 'no-store'
  });

  if (!response.ok) {
    const hint = response.status === 404
      ? ' Ensure the configuration file exists and restart ng serve after changing angular.json.'
      : '';
    throw new Error(`Failed to load app-config.json (HTTP ${response.status}).${hint}`);
  }

  const value: unknown = await response.json();
  const config = parseRuntimeConfig(value);
  environment.production = config.production;
  Object.assign(environment.azure, config.azure);
}
