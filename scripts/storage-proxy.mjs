import http from 'node:http';
import https from 'node:https';

const port = Number(process.env.STORAGE_PROXY_PORT || 4201);
const allowedServices = new Set(['blob', 'file', 'queue', 'table']);

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  const cosmosMatch = requestUrl.pathname.match(/^\/cosmos-proxy\/([a-z0-9-]{3,44})(\/.*)?$/i);
  if (cosmosMatch) {
    const allowedCosmosMethods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
    if (!allowedCosmosMethods.has(request.method || '')) {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
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
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', error => {
      if (!response.headersSent) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      response.end(error.message);
    });
    request.pipe(upstream);
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Only GET requests are allowed.');
    return;
  }

  const match = requestUrl.pathname.match(/^\/storage-proxy\/([a-z0-9]{3,24})\/(blob|file|queue|table)(\/.*)?$/i);
  if (!match || !allowedServices.has(match[2].toLowerCase())) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
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
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', error => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    response.end(error.message);
  });

  request.pipe(upstream);
});

server.listen(port, '127.0.0.1');
