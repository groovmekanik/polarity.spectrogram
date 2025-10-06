#!/usr/bin/env node
// Minimal, zero-dependency static file server for local dev.
// Serves current directory on http://localhost:5173 with basic MIME types and caching disabled.

const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '127.0.0.1';
const port = 5173;
const baseDir = process.cwd();

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, headers, bodyStream) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...headers
  });
  if (bodyStream) bodyStream.pipe(res); else res.end();
}

function safeJoin(base, target) {
  const targetPath = path.posix.normalize('/' + target.replace(/\\/g, '/'));
  return path.join(base, targetPath);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = safeJoin(baseDir, urlPath);

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        if (urlPath === '/' || urlPath === '') {
          const fallback = path.join(baseDir, 'index.html');
          return fs.readFile(fallback, (fbErr, fbData) => {
            if (fbErr) return send(res, 404, {'Content-Type': 'text/plain'}, null);
            send(res, 200, {'Content-Type': 'text/html; charset=utf-8'}, fs.createReadStream(fallback));
          });
        }
        return send(res, 404, {'Content-Type': 'text/plain; charset=utf-8'}, null);
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeByExt[ext] || 'application/octet-stream';
      send(res, 200, {'Content-Type': contentType}, fs.createReadStream(filePath));
    });
  });
});

server.listen(port, host, () => {
  console.log(`Dev server running at http://${host}:${port}`);
});


