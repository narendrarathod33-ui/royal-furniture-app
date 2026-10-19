// Static preview server: serves the built app (and /v2) under the same path
// prefix the GitHub Pages deploy uses, so local shots match production URLs.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/tmp/quickview-dist';
const PREFIX = '/royal-furniture-app';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (statErr, stat) => {
    if (!statErr && stat.isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('nf'); }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': p.startsWith('/_expo/') ? 'public, max-age=31536000, immutable' : 'public, max-age=600' });
      res.end(data);
    });
  });
}).listen(4125, '0.0.0.0', () => console.log('prefix server :4125'));
