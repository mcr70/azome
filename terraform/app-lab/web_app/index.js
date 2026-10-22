const http = require('node:http');

const port = Number(process.env.PORT || 8080);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');

  if (request.method !== 'GET' || requestUrl.pathname !== '/') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    message: 'App Service test endpoint received a request.',
    method: request.method,
    path: requestUrl.pathname,
    userAgent: request.headers['user-agent'] || 'unknown'
  };

  console.log(JSON.stringify(logEntry));

  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ status: 'ok', timestamp: logEntry.timestamp }));
});

server.listen(port, '0.0.0.0');
