/**
 * Локальный статический сервер для dist/.
 * Запуск: npm start (со сборкой) или npm run preview.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 4173;

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.json', 'application/json; charset=utf-8'],
]);

const notFound = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>404 — страница не найдена</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151714;color:#efece2;font:16px/1.6 system-ui,sans-serif}main{max-width:460px;padding:32px}a{color:#d9916c}code{font-family:ui-monospace,monospace;color:#a4a69a}</style>
</head><body><main><p><code>404</code></p><h1>Страница не найдена</h1><p>Похоже, адрес изменился или в нём опечатка.</p><p><a href="/">Вернуться на главную</a></p></main></body></html>`;

const server = http.createServer(async (request, response) => {
  const method = request.method;
  if (!['GET', 'HEAD'].includes(method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
    return;
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.resolve(dist, relative);
  if (!file.startsWith(dist + path.sep) && file !== dist) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    if (method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    if (method === 'HEAD') response.end();
    else response.end(notFound);
  }
});

server.listen(port, host, () => {
  console.log(`ТОК → http://${host}:${port}`);
  console.log('Ctrl+C — остановить сервер.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
