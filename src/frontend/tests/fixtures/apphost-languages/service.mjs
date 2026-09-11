import http from 'node:http';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('Aspire must provide a positive PORT environment variable.');
}

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Hello from an Aspire-orchestrated service.\n');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Service listening on http://127.0.0.1:${port}`);
});

process.on('SIGTERM', () => {
  server.close();
});
