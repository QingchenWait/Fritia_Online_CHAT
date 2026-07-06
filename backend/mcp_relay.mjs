import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';

const host = process.env.FRITIA_MCP_RELAY_HOST || '127.0.0.1';
const port = Number(process.env.FRITIA_MCP_RELAY_PORT || 17373);
const MCP_PROTOCOL_VERSION = '2025-06-18';
const RELAY_CLIENT_VERSION = '0.3.4';
const FILE_SCAN_LIMIT = 2000;
const FILE_EMBED_LIMIT_BYTES = 10 * 1024 * 1024;
const processes = new Map();

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    writeCors(response, 204);
    response.end();
    return;
  }
  if (request.method !== 'POST') {
    writeCors(response, 405);
    response.end('method not allowed');
    return;
  }
  try {
    const body = JSON.parse(await readRequestBody(request));
    const server = normalizeServerConfig(body.server || {});
    const rpcRequest = body.request;
    if (!rpcRequest?.jsonrpc || !rpcRequest.method) throw new Error('Invalid JSON-RPC request.');
    const session = getServerSession(server);
    const shouldTrackFiles = rpcRequest.method === 'tools/call';
    const beforeFiles = shouldTrackFiles ? snapshotFiles(server.cwd || process.cwd()) : new Map();
    const result = await session.send(rpcRequest);
    const changedFiles = shouldTrackFiles
      ? collectChangedFiles(server, beforeFiles, rpcRequest)
      : [];
    writeCors(response, 200, 'application/json; charset=utf-8');
    response.end(JSON.stringify(changedFiles.length ? { response: result, changedFiles } : result));
  } catch (error) {
    writeCors(response, 500, 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message: error?.message || 'MCP relay error'
      }
    }));
  }
}).listen(port, host, () => {
  console.log(`Fritia MCP stdio relay listening on http://${host}:${port}/mcp`);
});

process.on('exit', shutdownAll);
process.on('SIGINT', () => {
  shutdownAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdownAll();
  process.exit(0);
});

function getServerSession(config) {
  const key = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  const existing = processes.get(key);
  if (existing && !existing.closed) return existing;
  const command = createSpawnCommand(config);
  const child = spawn(command.file, command.args, {
    cwd: config.cwd || process.cwd(),
    env: { ...process.env, ...config.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const session = createSession(child, config);
  processes.set(key, session);
  return session;
}

function createSession(child, config) {
  let buffer = '';
  const pending = new Map();
  const stderrLines = [];
  const session = {
    closed: false,
    initialized: false,
    async send(request) {
      if (session.closed) throw new Error('MCP stdio server is not running.');
      if (!session.initialized && request.method !== 'initialize') {
        await initializeSession(session, config);
      }
      const response = await sendRaw(session, request, config);
      if (request.method === 'initialize') {
        await sendRaw(session, createInitializedNotification(), config);
        session.initialized = true;
      }
      return response;
    },
    close() {
      session.closed = true;
      child.kill();
    }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(String(message.id));
      if (!waiter) continue;
      pending.delete(String(message.id));
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    const text = chunk.trim();
    if (!text) return;
    stderrLines.push(text);
    while (stderrLines.length > 40) stderrLines.shift();
    console.warn(`[mcp:${config.command}] ${text}`);
  });
  child.on('error', error => {
    session.closed = true;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(withStderr(error, stderrLines));
    }
    pending.clear();
  });
  child.on('exit', () => {
    session.closed = true;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(withStderr(new Error('MCP stdio server exited.'), stderrLines));
    }
    pending.clear();
  });
  session.pending = pending;
  session.stdin = child.stdin;
  session.stderrLines = stderrLines;
  return session;
}

async function initializeSession(session, config) {
  const initResponse = await sendRaw(session, {
    jsonrpc: '2.0',
    id: createRpcId('init'),
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'Fritia MCP Relay',
        version: RELAY_CLIENT_VERSION
      }
    }
  }, config);
  if (initResponse?.error) {
    throw new Error(initResponse.error.message || JSON.stringify(initResponse.error));
  }
  await sendRaw(session, createInitializedNotification(), config);
  session.initialized = true;
}

function sendRaw(session, request, config) {
  if (session.closed) throw new Error('MCP stdio server is not running.');
  const line = `${JSON.stringify(request)}\n`;
  if (!request.id) {
    session.stdin.write(line);
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const id = String(request.id);
    session.pending.set(id, {
      resolve,
      reject,
      timer: setTimeout(() => {
        session.pending.delete(id);
        reject(withStderr(new Error(`MCP stdio request timeout after ${config.timeout}s.`), session.stderrLines));
      }, config.timeout * 1000)
    });
    session.stdin.write(line, error => {
      if (!error) return;
      const waiter = session.pending.get(id);
      if (!waiter) return;
      session.pending.delete(id);
      clearTimeout(waiter.timer);
      waiter.reject(withStderr(error, session.stderrLines));
    });
  });
}

function createInitializedNotification() {
  return {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  };
}

function createRpcId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeServerConfig(raw) {
  const command = String(raw.command || '').trim();
  if (!command) throw new Error('server.command is required.');
  return {
    command,
    args: Array.isArray(raw.args) ? raw.args.map(String) : [],
    env: raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env) ? raw.env : {},
    cwd: String(raw.cwd || ''),
    timeout: Math.max(1, Math.min(600, Number(raw.timeout) || 30))
  };
}

function createSpawnCommand(config) {
  if (process.platform !== 'win32' || !shouldUseWindowsShell(config.command)) {
    return { file: config.command, args: config.args };
  }
  return {
    file: 'cmd.exe',
    args: ['/d', '/s', '/c', [config.command, ...config.args].map(quoteWindowsArg).join(' ')]
  };
}

function shouldUseWindowsShell(command) {
  const lower = command.toLowerCase();
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) return true;
  return !/[\\/]/.test(command) && !/\.[a-z0-9]+$/i.test(command);
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!text) return '""';
  if (!/[\s"&|<>^]/.test(text)) return text;
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, '$&$&')}"`;
}

function withStderr(error, stderrLines = []) {
  const stderr = stderrLines.join('\n').trim();
  if (!stderr) return error;
  const message = `${error?.message || error}\nMCP stderr:\n${stderr}`;
  return new Error(message);
}

function snapshotFiles(root) {
  const base = resolve(root || process.cwd());
  const snapshot = new Map();
  walkFiles(base, snapshot, 0);
  return snapshot;
}

function walkFiles(directory, snapshot, depth) {
  if (snapshot.size >= FILE_SCAN_LIMIT || depth > 6) return;
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (snapshot.size >= FILE_SCAN_LIMIT) return;
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') continue;
    const path = resolve(directory, entry.name);
    try {
      if (entry.isDirectory()) {
        walkFiles(path, snapshot, depth + 1);
      } else if (entry.isFile()) {
        const stats = statSync(path);
        snapshot.set(path, { size: stats.size, mtimeMs: stats.mtimeMs });
      }
    } catch {}
  }
}

function collectChangedFiles(config, beforeFiles, request) {
  const root = resolve(config.cwd || process.cwd());
  const afterFiles = snapshotFiles(root);
  const paths = new Set();
  for (const [path, after] of afterFiles.entries()) {
    const before = beforeFiles.get(path);
    if (!before || before.size !== after.size || before.mtimeMs !== after.mtimeMs) paths.add(path);
  }
  for (const path of extractCandidatePaths(request, root)) {
    if (existsSync(path)) paths.add(path);
  }
  return [...paths].slice(0, 24).map(path => fileToAttachment(path)).filter(Boolean);
}

function extractCandidatePaths(value, root, results = new Set(), key = '') {
  if (Array.isArray(value)) {
    value.forEach(item => extractCandidatePaths(item, root, results, key));
    return results;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => extractCandidatePaths(childValue, root, results, childKey));
    return results;
  }
  if (typeof value !== 'string') return results;
  const text = value.trim();
  if (!text) return results;
  const candidates = [];
  const patterns = [
    /[A-Za-z]:[\\/][^\s"'<>|]+/g,
    /(?:^|[\s"'(])((?:\/[^\/\s"'<>|]+)+\.[A-Za-z0-9]{1,12})/g,
    /[\w\u4e00-\u9fa5 .()[\]-]+\.[A-Za-z0-9]{1,12}/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) candidates.push(String(match[1] || match[0] || '').trim());
  }
  if (/file|path|name|output|save|screenshot/i.test(key) && /\.[A-Za-z0-9]{1,12}$/.test(text)) {
    candidates.push(text);
  }
  for (const candidate of candidates) {
    const cleaned = candidate.replace(/^[\s"'(]+|[\s"')，。；,;]+$/g, '');
    if (!cleaned || /^https?:\/\//i.test(cleaned)) continue;
    const path = isAbsolute(cleaned) ? cleaned : resolve(root, cleaned);
    results.add(path);
  }
  return results;
}

function fileToAttachment(path) {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) return null;
    const mime = inferMime(path);
    const file = {
      path,
      name: basename(path),
      mime,
      size: stats.size,
      modifiedAt: stats.mtimeMs,
      source: 'mcp-relay-changed-file'
    };
    if (stats.size <= FILE_EMBED_LIMIT_BYTES) {
      file.dataBase64 = readFileSync(path).toString('base64');
    }
    return file;
  } catch {
    return null;
  }
}

function inferMime(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.json') return 'application/json';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.apk') return 'application/vnd.android.package-archive';
  return 'application/octet-stream';
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => resolve(body || '{}'));
    request.on('error', reject);
  });
}

function writeCors(response, status, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': contentType
  });
}

function shutdownAll() {
  for (const session of processes.values()) session.close();
  processes.clear();
}
