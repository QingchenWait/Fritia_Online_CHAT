import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const host = process.env.FRITIA_MCP_RELAY_HOST || '127.0.0.1';
const port = Number(process.env.FRITIA_MCP_RELAY_PORT || 17373);
const MCP_PROTOCOL_VERSION = '2025-06-18';
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
    const result = await session.send(rpcRequest);
    writeCors(response, 200, 'application/json; charset=utf-8');
    response.end(JSON.stringify(result));
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
        version: '0.3.0'
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
