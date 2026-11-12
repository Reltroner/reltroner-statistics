#!/usr/bin/env node
/**
 * Local static server for dist/ that applies dist/_headers (CSP and security headers), so previews
 * and browser tests run under the same policy Cloudflare Pages would apply. Loopback only.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/context.ts';

const dist = path.join(ROOT, 'dist');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Run npm run build before serving');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.xsd': 'application/xml; charset=utf-8', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function parseHeaders(): Array<{ pattern: RegExp; headers: Array<[string, string]> }> {
  const file = path.join(dist, '_headers');
  if (!fs.existsSync(file)) return [];
  const rules: Array<{ pattern: RegExp; headers: Array<[string, string]> }> = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`), headers: [] });
    else { const i = line.indexOf(':'); rules.at(-1)?.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]); }
  }
  return rules;
}
const rules = parseHeaders();

http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.normalize(path.join(dist, pathname));
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(dist, '404.html'); status = 404; }
  const headers: Record<string, string> = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' };
  for (const r of rules) if (r.pattern.test(pathname)) for (const [k, v] of r.headers) headers[k] = v;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}).listen(port, host, () => process.stdout.write(`Reltroner Statistics preview (with _headers): http://${host}:${port}\n`));
