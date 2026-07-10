import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const relativePath = path.normalize(pathname).replace(/^([\\/])+/, '');
  const filePath = path.join(root, relativePath);
  return filePath.startsWith(root) ? filePath : '';
}

createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url || '/');
  if (!filePath) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  try {
    const fileStats = await stat(filePath);
    if (fileStats.isDirectory()) {
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      if (relativePath === 'src/docs') {
        const entries = await readdir(filePath, { withFileTypes: true });
        response.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8'
        });
        response.end(JSON.stringify(entries
          .filter(entry => entry.isFile())
          .map(entry => ({ name: entry.name, type: 'file' }))));
        return;
      }
      response.writeHead(404);
      response.end('not found');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
}).listen(port, host, () => {
  console.log(`http://${host}:${port}/`);
});
