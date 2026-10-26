import http from 'node:http';
import https from 'node:https';

const port = Number(process.env.STORAGE_PROXY_PORT || process.env.PORT || 8080);
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:4100';
const allowedServices = new Set(['blob', 'file', 'queue', 'table']);

function corsHeaders(request, headers = {}) {
  const responseHeaders = { ...headers, Vary: 'Origin' };
  if (request.headers.origin === allowedOrigin) {
    responseHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    responseHeaders['Access-Control-Allow-Headers'] =
      request.headers['access-control-request-headers'] ||
      'authorization, content-type, x-ms-version, x-ms-date';
    responseHeaders['Access-Control-Max-Age'] = '600';
  }
  return responseHeaders;
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    response.writeHead(200, corsHeaders(request, { 'content-type': 'application/json' }));
    response.end(JSON.stringify({ status: 'Healthy' }));
    return;
  }

  // Handle Log Analytics proxy requests
  const logsMatch = requestUrl.pathname.match(
    /^\/log-analytics-proxy(\/v1\/workspaces\/[a-z0-9-]+\/(metadata|query))$/i
  );
  if (logsMatch) {
    const expectedMethod = logsMatch[2].toLowerCase() === 'metadata' ? 'GET' : 'POST';
    if (request.method !== expectedMethod) {
      response.writeHead(405, corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' }));
      response.end(`Only ${expectedMethod} requests are allowed for this route.`);
      return;
    }

    const headers = { ...request.headers };
    delete headers.origin;
    delete headers.connection;
    delete headers['proxy-authorization'];
    headers.host = 'api.loganalytics.azure.com';
    const upstream = https.request({
      hostname: 'api.loganalytics.azure.com',
      path: logsMatch[1] + requestUrl.search,
      method: request.method,
      headers
    }, upstreamResponse => {
      // Remove upstream CORS headers to prevent duplicate header conflicts
      const upstreamHeaders = { ...upstreamResponse.headers };
      delete upstreamHeaders['access-control-allow-origin'];

      response.writeHead(
        upstreamResponse.statusCode || 502,
        corsHeaders(request, upstreamHeaders)
      );
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(90000, () => upstream.destroy(new Error('Log Analytics request timed out.')));
    upstream.on('error', error => {
      if (!response.headersSent) {
        response.writeHead(502, corsHeaders(request, { 'content-type': 'application/json' }));
      }
      response.end(JSON.stringify({ error: { message: error.message } }));
    });
    upstream.on('close', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }

  // Handle Azure Governance proxy requests
  const governanceMatch = requestUrl.pathname.match(
    /^\/governance-proxy(\/(?:subscriptions|providers)(?:\/[^?#]*)?)$/i
  );
  if (governanceMatch) {
    const allowedGovernanceMethods = new Set(['GET', 'POST']);
    if (!allowedGovernanceMethods.has(request.method || '')) {
      response.writeHead(405, corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' }));
      response.end('Only GET and POST requests are allowed for governance routes.');
      return;
    }
    if (!request.headers.authorization?.startsWith('Bearer ')) {
      response.writeHead(401, corsHeaders(request, { 'content-type': 'application/json' }));
      response.end(JSON.stringify({
        error: {
          code: 'AuthorizationRequired',
          message: 'Sign in through Azome and retry this governance request.'
        }
      }));
      return;
    }

    const headers = { ...request.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.connection;
    delete headers['proxy-authorization'];
    headers.host = 'management.azure.com';
    const upstream = https.request({
      hostname: 'management.azure.com',
      path: governanceMatch[1] + requestUrl.search,
      method: request.method,
      headers
    }, upstreamResponse => {
      // Remove upstream CORS headers to prevent duplicate header conflicts
      const upstreamHeaders = { ...upstreamResponse.headers };
      delete upstreamHeaders['access-control-allow-origin'];

      response.writeHead(
        upstreamResponse.statusCode || 502,
        corsHeaders(request, upstreamHeaders)
      );
      upstreamResponse.pipe(response);
    });
    upstream.setTimeout(90000, () => upstream.destroy(new Error('Azure governance request timed out.')));
    upstream.on('error', error => {
      if (!response.headersSent) {
        response.writeHead(502, corsHeaders(request, { 'content-type': 'application/json' }));
      }
      response.end(JSON.stringify({ error: { message: error.message } }));
    });
    upstream.on('close', () => upstream.destroy());
    request.pipe(upstream);
    return;
  }

  // Handle Cosmos DB data-plane proxy requests
  const cosmosMatch = requestUrl.pathname.match(/^\/cosmos-proxy\/([a-z0-9-]{3,44})(\/.*)?$/i);
  if (cosmosMatch) {
    const allowedCosmosMethods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
    if (!allowedCosmosMethods.has(request.method || '')) {
      response.writeHead(405, corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' }));
      response.end('Only GET, POST, PUT, and DELETE requests are allowed.');
      return;
    }

    const account = cosmosMatch[1].toLowerCase();
    const headers = { ...request.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.connection;
    delete headers['proxy-authorization'];
    headers.host = account + '.documents.azure.com';
    const upstream = https.request({
      hostname: account + '.documents.azure.com',
      path: (cosmosMatch[2] || '/') + requestUrl.search,
      method: request.method,
      headers
    }, upstreamResponse => {
      // Remove upstream CORS headers to prevent duplicate header conflicts
      const upstreamHeaders = { ...upstreamResponse.headers };
      delete upstreamHeaders['access-control-allow-origin'];

      response.writeHead(
        upstreamResponse.statusCode || 502,
        corsHeaders(request, upstreamHeaders)
      );
      upstreamResponse.pipe(response);
    });
    upstream.on('error', error => {
      if (!response.headersSent) {
        response.writeHead(
          502,
          corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' })
        );
      }
      response.end(error.message);
    });
    request.pipe(upstream);
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' }));
    response.end('Only GET requests are allowed.');
    return;
  }

  // Handle Azure Storage data-plane proxy requests
  const match = requestUrl.pathname.match(/^\/storage-proxy\/([a-z0-9]{3,24})\/(blob|file|queue|table)(\/.*)?$/i);
  if (!match || !allowedServices.has(match[2].toLowerCase())) {
    response.writeHead(404, corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' }));
    response.end('Unknown Storage proxy route.');
    return;
  }

  const account = match[1].toLowerCase();
  const service = match[2].toLowerCase();
  const upstreamPath = (match[3] || '/') + requestUrl.search;
  const headers = { ...request.headers };
  delete headers.host;
  delete headers.origin;
  delete headers.connection;
  delete headers.authorization;
  delete headers['proxy-authorization'];
  headers.host = account + '.' + service + '.core.windows.net';

  const upstream = https.request({
    hostname: account + '.' + service + '.core.windows.net',
    path: upstreamPath,
    method: 'GET',
    headers
  }, upstreamResponse => {
    // Remove upstream CORS headers to prevent duplicate header conflicts
    const upstreamHeaders = { ...upstreamResponse.headers };
    delete upstreamHeaders['access-control-allow-origin'];

    response.writeHead(
      upstreamResponse.statusCode || 502,
      corsHeaders(request, upstreamHeaders)
    );
    upstreamResponse.pipe(response);
  });

  upstream.on('error', error => {
    if (!response.headersSent) {
        response.writeHead(
          502,
          corsHeaders(request, { 'content-type': 'text/plain; charset=utf-8' })
        );
    }
    response.end(error.message);
  });

  request.pipe(upstream);
});

const host = process.env.WEBSITES_PORT ? '0.0.0.0' : '127.0.0.1';
server.listen(port, host);