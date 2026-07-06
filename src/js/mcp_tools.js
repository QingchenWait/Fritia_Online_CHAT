import { getRuntimeEnvironment, isBrowserFrontendRuntime } from './runtime_env.js';
import { createId, loadAppStore, loadJson, saveJson, STORAGE_KEYS } from './storage.js';
import { getSettings } from './settings.js';
import { characterAvatar, getCharacterById } from './characters.js';
import { getActiveKnowledgeBaseIds } from './knowledge_base.js';
import { getLongTermMemorySettings } from './long_term_memory.js';
import { requestCharacterReply } from './chat_engine.js';

export const MCP_CONFIG_KEY = 'fritia_mcp_tool_config';
export const MCP_CONFIG_EVENT = 'fritia-mcp-config-updated';
export const MCP_LOG_EVENT = 'fritia-mcp-log-updated';
export const MCP_PROTOCOL_VERSION = '2025-06-18';

export const MCP_TRANSPORTS = Object.freeze({
  STREAMABLE_HTTP: 'streamable_http',
  SSE: 'sse',
  STDIO: 'stdio'
});

const DEFAULT_RELAY_URL = 'http://127.0.0.1:17373/mcp';
const MAX_LOGS = 120;
const mcpSessions = new Map();

const DEFAULT_STREAMABLE_CONFIG = Object.freeze({
  transport: MCP_TRANSPORTS.STREAMABLE_HTTP,
  url: '',
  headers: {},
  timeout: 10,
  sse_read_timeout: 300
});

const DEFAULT_STREAMABLE_CONFIG_JSON = '';

const DEFAULT_STDIO_CONFIG = Object.freeze({
  transport: MCP_TRANSPORTS.STDIO,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  env: {},
  cwd: '',
  relayUrl: DEFAULT_RELAY_URL,
  timeout: 30
});

const DEFAULT_STDIO_CONFIG_JSON = `{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}`;

export const BUILTIN_FILESYSTEM_MCP_ID = 'builtin-filesystem';

const BUILTIN_FILESYSTEM_CONFIG_JSON = DEFAULT_STDIO_CONFIG_JSON;

const BUILTIN_FILESYSTEM_CLIENT = Object.freeze({
  id: BUILTIN_FILESYSTEM_MCP_ID,
  name: 'Filesystem',
  enabled: true,
  transport: MCP_TRANSPORTS.STDIO,
  permission: 'allow',
  config: DEFAULT_STDIO_CONFIG,
  configJson: BUILTIN_FILESYSTEM_CONFIG_JSON,
  builtin: 'filesystem',
  hiddenFromPicker: true,
  createdAt: 0,
  updatedAt: 0
});

const DEFAULT_MCP_CONFIG = Object.freeze({
  version: 1,
  selectedClientIdsByConversation: {},
  webMcpServer: {
    enabled: true,
    exposeCharacters: true,
    requireConfirmation: false,
    shareCharacterProfile: true,
    allowedOrigins: []
  },
  clients: [
    {
      id: 'mcp-server',
      name: 'server-name',
      enabled: true,
      transport: MCP_TRANSPORTS.STREAMABLE_HTTP,
      permission: 'ask',
      config: DEFAULT_STREAMABLE_CONFIG,
      configJson: DEFAULT_STREAMABLE_CONFIG_JSON,
      createdAt: 0,
      updatedAt: 0
    }
  ],
  permissions: {
    level: 'ask',
    requireManualApproval: true,
    allowRemoteHttp: true,
    allowLocalStdio: true,
    shareCharacterProfile: true,
    shareLongTermMemory: true,
    isolateToolContext: false,
    requireFileWriteApproval: false
  },
  logs: []
});

export function getMcpConfig() {
  return normalizeMcpConfig(loadJson(MCP_CONFIG_KEY, DEFAULT_MCP_CONFIG));
}

export function saveMcpConfig(next) {
  const previous = getMcpConfig();
  const normalized = normalizeMcpConfig({ ...previous, ...next });
  saveJson(MCP_CONFIG_KEY, normalized);
  document.dispatchEvent(new CustomEvent(MCP_CONFIG_EVENT, { detail: normalized }));
  return normalized;
}

export function createDefaultMcpClient(transport = MCP_TRANSPORTS.STREAMABLE_HTTP) {
  const timestamp = Date.now();
  const normalizedTransport = normalizeTransport(transport);
  const id = createId(normalizedTransport === MCP_TRANSPORTS.STDIO ? 'stdio' : 'http');
  const configJson = normalizedTransport === MCP_TRANSPORTS.STDIO
    ? DEFAULT_STDIO_CONFIG_JSON
    : DEFAULT_STREAMABLE_CONFIG_JSON;
  return normalizeMcpClient({
    id,
    name: normalizedTransport === MCP_TRANSPORTS.STDIO ? 'stdio-mcp' : 'streamable-http',
    enabled: true,
    transport: normalizedTransport,
    permission: 'ask',
    config: normalizedTransport === MCP_TRANSPORTS.STDIO
      ? { ...DEFAULT_STDIO_CONFIG }
      : { ...DEFAULT_STREAMABLE_CONFIG },
    configJson,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function upsertMcpClient(client) {
  const config = getMcpConfig();
  const normalized = normalizeMcpClient({ ...client, updatedAt: Date.now() });
  mcpSessions.delete(normalized.id);
  mcpSessions.delete(`${normalized.id}:sse`);
  const clients = config.clients.some(item => item.id === normalized.id)
    ? config.clients.map(item => (item.id === normalized.id ? normalized : item))
    : [...config.clients, normalized];
  return saveMcpConfig({ clients });
}

export function deleteMcpClient(clientId) {
  const config = getMcpConfig();
  const clients = config.clients.filter(item => item.id !== clientId);
  const selectedClientIdsByConversation = {};
  Object.entries(config.selectedClientIdsByConversation || {}).forEach(([conversationId, ids]) => {
    selectedClientIdsByConversation[conversationId] = ids.filter(id => id !== clientId);
  });
  return saveMcpConfig({ clients: clients.length ? clients : [createDefaultMcpClient()], selectedClientIdsByConversation });
}

export function parseMcpServerConfigJson(value, transport) {
  const source = normalizeConfigJson(value);
  const parsed = source ? JSON.parse(source) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('服务器配置 JSON 必须是对象。');
  }
  const { name, config: configSource } = unwrapMcpServerConfig(parsed, transport);
  const normalizedTransport = detectMcpTransport(configSource, transport);
  if (isRemoteMcpTransport(normalizedTransport)) {
    if (!String(configSource.url || '').trim()) throw new Error('Streamable HTTP 配置需要 url。');
    return {
      ...normalizeClientConfig({ ...DEFAULT_STREAMABLE_CONFIG, ...configSource, transport: normalizedTransport }, normalizedTransport),
      name: name || configSource.name || '',
      configJson: source
    };
  }
  if (!String(configSource.command || '').trim()) throw new Error('Stdio MCP 配置需要 command。');
  return {
    ...normalizeClientConfig({ ...DEFAULT_STDIO_CONFIG, ...configSource, transport: normalizedTransport }, normalizedTransport),
    name: name || configSource.name || '',
    configJson: source
  };
}

export function formatMcpServerConfigJson(config = {}, transport, name = 'server-name') {
  const normalized = normalizeClientConfig(config, normalizeTransport(config.transport || transport));
  const serverName = safeMcpServerConfigName(name || config.name || 'server-name');
  const server = normalized.transport === MCP_TRANSPORTS.STDIO
    ? {
        command: normalized.command,
        ...(normalized.args.length ? { args: normalized.args } : {}),
        ...(Object.keys(normalized.env || {}).length ? { env: normalized.env } : {}),
        ...(normalized.cwd ? { cwd: normalized.cwd } : {})
      }
    : {
        ...(normalized.transport === MCP_TRANSPORTS.SSE ? { transport: 'sse' } : {}),
        url: normalized.url,
        ...(Object.keys(normalized.headers || {}).length ? { headers: normalized.headers } : {})
      };
  return JSON.stringify({ mcpServers: { [serverName]: server } }, null, 2);
}

function unwrapMcpServerConfig(parsed, transport) {
  if (!parsed?.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    return { name: parsed.name || '', config: parsed };
  }
  const entries = Object.entries(parsed.mcpServers).filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value));
  if (!entries.length) throw new Error('mcpServers 中没有可用的 MCP 服务配置。');
  const preferred = entries.find(([, value]) => {
    if (transport === MCP_TRANSPORTS.STDIO) return Boolean(value.command);
    if (transport === MCP_TRANSPORTS.SSE) return detectMcpTransport(value, transport) === MCP_TRANSPORTS.SSE;
    return Boolean(value.url);
  }) || entries[0];
  const [name, server] = preferred;
  return {
    name: server.name || name,
    config: {
      ...server,
      name: server.name || name,
      transport: server.transport || server.type || (server.url ? MCP_TRANSPORTS.STREAMABLE_HTTP : MCP_TRANSPORTS.STDIO)
    }
  };
}

function detectMcpTransport(config = {}, fallback = MCP_TRANSPORTS.STREAMABLE_HTTP) {
  const declared = String(config.transport || config.type || '').trim().toLowerCase().replace(/-/g, '_');
  if (['stdio', 'local', 'command'].includes(declared)) return MCP_TRANSPORTS.STDIO;
  if (declared === 'sse') return MCP_TRANSPORTS.SSE;
  if (['streamable_http', 'http', 'remote'].includes(declared)) return MCP_TRANSPORTS.STREAMABLE_HTTP;
  if (String(config.url || '').trim()) return MCP_TRANSPORTS.STREAMABLE_HTTP;
  if (String(config.command || '').trim()) return MCP_TRANSPORTS.STDIO;
  return normalizeTransport(fallback);
}

function normalizeConfigJson(value) {
  return String(value || '').trim();
}

function safeMcpServerConfigName(value) {
  return String(value || 'server-name').trim().replace(/\s+/g, '-') || 'server-name';
}

function isRemoteMcpTransport(transport) {
  return transport === MCP_TRANSPORTS.STREAMABLE_HTTP || transport === MCP_TRANSPORTS.SSE;
}

export function getAvailableMcpClients(options = {}) {
  const config = getMcpConfig();
  const environment = options.environment || getRuntimeEnvironment();
  const pureFrontend = isBrowserFrontendRuntime(environment);
  return config.clients.filter(client => {
    if (!options.includeDisabled && !client.enabled) return false;
    if (!options.includeHidden && client.hiddenFromPicker) return false;
    if (pureFrontend) return isRemoteMcpTransport(client.transport);
    return true;
  });
}

export function getSelectedMcpClientIds(conversationId) {
  const config = getMcpConfig();
  const ids = Array.isArray(config.selectedClientIdsByConversation?.[conversationId])
    ? config.selectedClientIdsByConversation[conversationId]
    : [];
  const available = new Set(getAvailableMcpClients().map(client => client.id));
  return ids.filter(id => available.has(id));
}

export function setSelectedMcpClientIds(conversationId, ids = []) {
  if (!conversationId) return getMcpConfig();
  const config = getMcpConfig();
  const available = new Set(getAvailableMcpClients().map(client => client.id));
  const selected = [...new Set(ids)].filter(id => available.has(id));
  return saveMcpConfig({
    selectedClientIdsByConversation: {
      ...config.selectedClientIdsByConversation,
      [conversationId]: selected
    }
  });
}

export function isMcpEnabledForConversation(conversationId) {
  return getSelectedMcpClientIds(conversationId).length > 0;
}

export async function collectMcpToolDefinitions(clientIds = [], options = {}) {
  const config = getMcpConfig();
  const effectiveClientIds = withImplicitFilesystemClientIds(clientIds);
  const clientsById = new Map(getAvailableMcpClients({ includeHidden: true }).map(client => [client.id, client]));
  const tools = [];
  const registry = {};
  const errors = [];
  for (const clientId of effectiveClientIds) {
    throwIfMcpAborted(options.signal);
    const client = clientsById.get(clientId);
    if (!client) continue;
    try {
      const listed = await listMcpTools(client, options);
      for (const tool of listed) {
        const functionName = createOpenAiToolName(client, tool, registry);
        registry[functionName] = {
          client,
          toolName: tool.name,
          tool
        };
        tools.push({
          type: 'function',
          function: {
            name: functionName,
            description: compactDescription(`${client.name}: ${tool.description || tool.name}`),
            parameters: normalizeJsonSchema(tool.inputSchema)
          }
        });
      }
    } catch (error) {
      if (isMcpAbortError(error)) throw error;
      const message = error?.message || '工具列表读取失败';
      errors.push({ clientId, message: `${client.name}: ${message}` });
      addMcpLog({
        source: 'mcp-client',
        clientId,
        toolName: 'tools/list',
        args: {},
        result: message,
        status: 'error'
      });
    }
  }
  return { tools, registry, errors, permissions: config.permissions };
}

export async function listMcpTools(client, options = {}) {
  assertRunnableMcpClient(client);
  const result = await sendMcpRequest(client, 'tools/list', {}, options);
  if (!result || !Array.isArray(result.tools)) {
    throw new Error(`tools/list 未返回工具列表：${formatMcpContentText(result) || JSON.stringify(result || {})}`);
  }
  const tools = Array.isArray(result?.tools) ? result.tools : [];
  return tools.map(tool => ({
    name: String(tool.name || '').trim(),
    description: String(tool.description || ''),
    inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
  })).filter(tool => tool.name);
}

export async function callMcpToolByRegistryEntry(entry, args = {}, options = {}) {
  if (!entry?.client || !entry.toolName) throw new Error('MCP 工具不存在。');
  throwIfMcpAborted(options.signal);
  await assertMcpPermission(entry.client, entry.toolName, args);
  throwIfMcpAborted(options.signal);
  await assertMcpFileWritePermission(entry.client, entry.toolName, args);
  throwIfMcpAborted(options.signal);
  const startedAt = Date.now();
  addMcpLog({
    source: entry.client.transport === MCP_TRANSPORTS.STDIO ? 'local-mcp-relay' : 'webmcp-client',
    clientId: entry.client.id,
    toolName: entry.toolName,
    args,
    result: '调用中',
    status: 'running',
    createdAt: startedAt
  });
  try {
    const result = await sendMcpRequest(entry.client, 'tools/call', {
      name: entry.toolName,
      arguments: args && typeof args === 'object' ? args : {}
    }, options);
    throwIfMcpAborted(options.signal);
    addMcpLog({
      source: entry.client.transport === MCP_TRANSPORTS.STDIO ? 'local-mcp-relay' : 'webmcp-client',
      clientId: entry.client.id,
      toolName: entry.toolName,
      args,
      result: formatMcpContentText(result),
      status: 'success',
      createdAt: startedAt,
      finishedAt: Date.now()
    });
    return result;
  } catch (error) {
    addMcpLog({
      source: entry.client.transport === MCP_TRANSPORTS.STDIO ? 'local-mcp-relay' : 'webmcp-client',
      clientId: entry.client.id,
      toolName: entry.toolName,
      args,
      result: error?.message || 'MCP 调用失败',
      status: 'error',
      createdAt: startedAt,
      finishedAt: Date.now()
    });
    throw error;
  }
}

export function initWebMcpServer({ getStore = loadAppStore } = {}) {
  if (typeof window === 'undefined') return null;
  const syncManifest = () => writeWebMcpManifestElement(buildWebMcpManifest(getStore()));
  const api = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    manifest: () => {
      const manifest = buildWebMcpManifest(getStore());
      writeWebMcpManifestElement(manifest);
      return manifest;
    },
    listTools: () => getWebMcpTools(),
    callTool: (name, args = {}) => callWebMcpTool(name, args, getStore()),
    getConfig: () => getMcpConfig().webMcpServer
  };
  window.FritiaWebMCP = api;
  syncManifest();
  document.addEventListener(MCP_CONFIG_EVENT, syncManifest);
  document.addEventListener('fritia-next-chat-store-updated', syncManifest);
  document.dispatchEvent(new CustomEvent('fritia-webmcp-ready', {
    detail: buildWebMcpManifest(getStore())
  }));
  return api;
}

export function getWebMcpTools() {
  return [
    {
      name: 'fritia.list_characters',
      description: '列出芙提雅 ONLINE CHAT 中可被外部 agent 继承人格的角色。',
      inputSchema: { type: 'object', properties: {} }
    },
    {
      name: 'fritia.get_character_context',
      description: '读取指定角色的人格、简介、标签、知识库和长期记忆状态，不返回 API Key。',
      inputSchema: {
        type: 'object',
        properties: {
          characterId: { type: 'string' }
        },
        required: ['characterId']
      }
    },
    {
      name: 'fritia.chat_as_character',
      description: '调用当前 APP 中指定角色的人格、知识库、长期记忆和默认 LLM 提供商生成一次回复。',
      inputSchema: {
        type: 'object',
        properties: {
          characterId: { type: 'string' },
          message: { type: 'string' }
        },
        required: ['characterId', 'message']
      }
    }
  ];
}

export function buildWebMcpManifest(store = loadAppStore()) {
  const settings = getSettings();
  return {
    name: '芙提雅 ONLINE CHAT',
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: 'browser-window',
    exposedObject: 'window.FritiaWebMCP',
    tools: getWebMcpTools(),
    characters: (store.characters || []).map(character => ({
      id: character.id,
      name: character.name,
      description: character.description,
      avatar: characterAvatar(character),
      tags: character.tags || []
    })),
    capabilities: {
      characterPersona: true,
      longTermMemory: getLongTermMemorySettings().enabled,
      knowledgeBase: getActiveKnowledgeBaseIds().length > 0,
      llmProvider: Boolean(settings.apiKey && settings.model)
    }
  };
}

export function addMcpLog(entry = {}) {
  const config = getMcpConfig();
  const log = normalizeMcpLog(entry);
  const normalized = normalizeMcpConfig({
    ...config,
    logs: [log, ...(config.logs || [])].slice(0, MAX_LOGS)
  });
  saveJson(MCP_CONFIG_KEY, normalized);
  document.dispatchEvent(new CustomEvent(MCP_LOG_EVENT, { detail: { log, config: normalized } }));
  return log;
}

export function clearMcpLogs() {
  return saveMcpConfig({ logs: [] });
}

export function formatMcpContentText(result) {
  if (!result) return '';
  const content = Array.isArray(result.content) ? result.content : [];
  if (content.length) {
    return content.map(item => {
      if (item.type === 'text') return item.text || '';
      if (item.type === 'image') return `[图片] ${item.mimeType || ''}`.trim();
      if (item.type === 'audio') return `[音频] ${item.mimeType || item.mime || ''}`.trim();
      if (item.type === 'resource') return `[资源] ${item.resource?.uri || ''}`.trim();
      return JSON.stringify(item);
    }).filter(Boolean).join('\n');
  }
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

async function callWebMcpTool(name, args, store) {
  const config = getMcpConfig();
  if (!config.webMcpServer.enabled) throw new Error('WebMCP 服务端未启用。');
  await assertWebMcpPermission(name, args);
  const startedAt = Date.now();
  try {
    let result;
    if (name === 'fritia.list_characters') {
      result = {
        content: [{
          type: 'text',
          text: JSON.stringify(buildWebMcpManifest(store).characters, null, 2)
        }]
      };
    } else if (name === 'fritia.get_character_context') {
      result = {
        content: [{
          type: 'text',
          text: JSON.stringify(buildCharacterContext(store, args.characterId), null, 2)
        }]
      };
    } else if (name === 'fritia.chat_as_character') {
      result = await callCharacterFromWebMcp(store, args);
    } else {
      throw new Error(`未知 WebMCP 工具：${name}`);
    }
    addMcpLog({
      source: 'webmcp-server',
      toolName: name,
      args,
      result: formatMcpContentText(result),
      status: 'success',
      createdAt: startedAt,
      finishedAt: Date.now()
    });
    return result;
  } catch (error) {
    addMcpLog({
      source: 'webmcp-server',
      toolName: name,
      args,
      result: error?.message || 'WebMCP 调用失败',
      status: 'error',
      createdAt: startedAt,
      finishedAt: Date.now()
    });
    throw error;
  }
}

async function callCharacterFromWebMcp(store, args = {}) {
  const character = getCharacterById(store.characters, args.characterId);
  if (!character) throw new Error('角色不存在。');
  const userText = String(args.message || '').trim();
  if (!userText) throw new Error('message 不能为空。');
  const conversation = store.conversations.find(item => item.type === 'private' && item.memberIds?.[0] === character.id)
    || {
      id: `webmcp:${character.id}`,
      type: 'private',
      title: character.name,
      memberIds: [character.id],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  const result = await requestCharacterReply({
    store,
    conversation,
    character,
    userText,
    mode: 'private',
    userMessage: {
      id: createId('webmcp_user'),
      role: 'user',
      speakerId: 'external-agent',
      speakerName: '外部 Agent',
      text: userText,
      attachments: []
    }
  });
  const text = typeof result === 'string' ? result : result?.text || '';
  return { content: [{ type: 'text', text }] };
}

function buildCharacterContext(store, characterId) {
  const character = getCharacterById(store.characters, characterId);
  if (!character) throw new Error('角色不存在。');
  const settings = getSettings();
  return {
    id: character.id,
    name: character.name,
    description: character.description,
    prompt: character.prompt,
    examples: character.examples,
    tags: character.tags || [],
    avatar: characterAvatar(character),
    knowledgeBaseEnabledCount: getActiveKnowledgeBaseIds().length,
    longTermMemoryEnabled: getLongTermMemorySettings().enabled,
    llmProvider: {
      baseUrl: settings.baseUrl,
      model: settings.model,
      configured: Boolean(settings.apiKey)
    }
  };
}

function writeWebMcpManifestElement(manifest) {
  if (typeof document === 'undefined') return;
  let element = document.getElementById('fritia-webmcp-manifest');
  if (!element) {
    element = document.createElement('script');
    element.id = 'fritia-webmcp-manifest';
    element.type = 'application/json';
    element.dataset.webmcp = 'fritia-online-chat';
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(manifest);
}

function assertRunnableMcpClient(client) {
  if (!client) throw new Error('MCP 客户端不存在。');
  if (client.transport === MCP_TRANSPORTS.STDIO) {
    if (!String(client.config?.command || '').trim()) throw new Error('Stdio MCP 配置需要 command。');
    return;
  }
  if (!String(client.config?.url || '').trim()) throw new Error('Streamable HTTP / SSE MCP 配置需要 url。');
}

async function sendMcpRequest(client, method, params = {}, options = {}) {
  assertRunnableMcpClient(client);
  throwIfMcpAborted(options.signal);
  if (client.transport === MCP_TRANSPORTS.STDIO) {
    return sendStdioRelayRequest(client, method, params, options);
  }
  if (client.transport === MCP_TRANSPORTS.SSE) {
    return sendSseMcpRequest(client, method, params, options);
  }
  return sendStreamableHttpRequest(client, method, params, options);
}

async function sendStreamableHttpRequest(client, method, params = {}, options = {}) {
  const session = await ensureStreamableHttpSession(client, options);
  const request = createJsonRpcRequest(method, params);
  const targetClient = withClientUrl(client, session.url || client.config.url);
  const nativeResponse = await sendNativeStreamableHttpRequest(targetClient, session, request, options);
  throwIfMcpAborted(options.signal);
  if (nativeResponse) return parseMcpJsonRpcResponse(nativeResponse, request.id);
  const response = await fetchMcpHttp(targetClient.config.url, {
    method: 'POST',
    headers: buildMcpHeaders(targetClient, session.sessionId),
    body: JSON.stringify(request),
    signal: options.signal
  }, 'tools/list' === method ? '读取工具列表' : `调用 ${method}`);
  const nextSessionId = response.headers.get('mcp-session-id');
  if (nextSessionId) session.sessionId = nextSessionId;
  return parseMcpJsonRpcResponse(await readMcpResponse(response, request.id), request.id);
}

async function ensureStreamableHttpSession(client, options = {}) {
  const cacheKey = client.id;
  const cached = mcpSessions.get(cacheKey);
  if (cached?.sessionId || cached?.initializedAt) return cached;
  const initRequest = createJsonRpcRequest('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'Fritia Online CHAT',
      version: '0.1.0'
    }
  });
  let lastError = null;
  for (const url of getRemoteUrlCandidates(client.config.url)) {
    throwIfMcpAborted(options.signal);
    const targetClient = withClientUrl(client, url);
    try {
      const session = await initializeStreamableHttpSession(targetClient, initRequest, options);
      mcpSessions.set(cacheKey, session);
      return session;
    } catch (error) {
      if (isMcpAbortError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Streamable HTTP MCP 初始化失败。');
}

async function initializeStreamableHttpSession(client, initRequest, options = {}) {
  const nativeRelay = getNativeHttpRelay();
  if (nativeRelay?.request) {
    const session = { sessionId: '', initializedAt: Date.now(), url: client.config.url };
    const relayResult = await nativeRelay.request({
      client: client.config,
      sessionId: '',
      request: initRequest
    });
    throwIfMcpAborted(options.signal);
    const relaySessionId = getNativeRelaySessionId(relayResult);
    if (relaySessionId) session.sessionId = relaySessionId;
    parseMcpJsonRpcResponse(getNativeRelayResponse(relayResult), initRequest.id);
    await nativeRelay.request({
      client: client.config,
      sessionId: session.sessionId,
      request: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      }
    }).catch(() => {});
    return session;
  }
  const response = await fetchMcpHttp(client.config.url, {
    method: 'POST',
    headers: buildMcpHeaders(client),
    body: JSON.stringify(initRequest),
    signal: options.signal
  }, '初始化 Streamable HTTP MCP');
  const session = {
    sessionId: response.headers.get('mcp-session-id') || '',
    initializedAt: Date.now(),
    url: client.config.url
  };
  parseMcpJsonRpcResponse(await readMcpResponse(response, initRequest.id), initRequest.id);
  await fetchMcpHttp(client.config.url, {
    method: 'POST',
    headers: buildMcpHeaders(client, session.sessionId),
    signal: options.signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    })
  }).catch(() => {});
  return session;
}

async function sendNativeStreamableHttpRequest(client, session, request, options = {}) {
  const nativeRelay = getNativeHttpRelay();
  if (!nativeRelay?.request) return null;
  throwIfMcpAborted(options.signal);
  const relayResult = await nativeRelay.request({
    client: client.config,
    sessionId: session.sessionId || '',
    request
  });
  throwIfMcpAborted(options.signal);
  const relaySessionId = getNativeRelaySessionId(relayResult);
  if (relaySessionId) session.sessionId = relaySessionId;
  return getNativeRelayResponse(relayResult);
}

function getNativeHttpRelay() {
  if (typeof window === 'undefined') return null;
  return window.__FRITIA_MCP_HTTP_RELAY__ || null;
}

function getNativeRelaySessionId(result) {
  return String(result?.sessionId || result?.session_id || '').trim();
}

function getNativeRelayResponse(result) {
  if (result && typeof result === 'object' && !Array.isArray(result) && 'response' in result) {
    const response = result.response;
    const changedFiles = normalizeNativeChangedFiles(result.changedFiles || result.changed_files || result.files);
    if (changedFiles.length && response && typeof response === 'object' && !Array.isArray(response)) {
      const existing = normalizeNativeChangedFiles(response.changedFiles || response.changed_files || response.files);
      return {
        ...response,
        changedFiles: [...existing, ...changedFiles]
      };
    }
    return response;
  }
  return result;
}

function normalizeNativeChangedFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.filter(file => file && typeof file === 'object').map(file => ({
    ...file,
    path: String(file.path || file.filePath || file.file_path || '').trim(),
    name: String(file.name || '').trim(),
    mime: String(file.mime || file.mimeType || file.mime_type || '').trim(),
    dataBase64: file.dataBase64 || file.data_base64 || file.base64 || '',
    dataUrl: file.dataUrl || file.data_url || '',
    size: Number(file.size) || 0
  }));
}

async function fetchMcpHttp(url, options, actionLabel = '请求 MCP') {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (options?.signal?.aborted || isMcpAbortError(error)) throw createMcpAbortError();
    throw new Error(`${actionLabel}失败，无法连接 MCP 服务 ${url}：${error?.message || error}`);
  }
}

function getRemoteUrlCandidates(url) {
  const source = String(url || '').trim();
  const candidates = [source];
  try {
    const parsed = new URL(source);
    if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.push(parsed.toString());
    } else if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.push(parsed.toString());
    }
  } catch {}
  return [...new Set(candidates.filter(Boolean))];
}

function withClientUrl(client, url) {
  if (!url || url === client.config.url) return client;
  return {
    ...client,
    config: {
      ...client.config,
      url
    }
  };
}

async function sendSseMcpRequest(client, method, params = {}, options = {}) {
  const session = await ensureSseSession(client, options);
  const request = createJsonRpcRequest(method, params);
  const pending = waitForSseMessage(session, request.id, client.config.sse_read_timeout, options.signal);
  let directResponse = null;
  try {
    directResponse = await postSseMessage(client, session, request, method, options);
  } catch (error) {
    clearSsePending(session, request.id);
    throw error;
  }
  if (directResponse) {
    clearSsePending(session, request.id);
    return parseMcpJsonRpcResponse(directResponse, request.id);
  }
  return parseMcpJsonRpcResponse(await pending, request.id);
}

async function ensureSseSession(client, options = {}) {
  const cacheKey = `${client.id}:sse`;
  const cached = mcpSessions.get(cacheKey);
  if (cached?.messageUrl && cached?.initializedAt) return cached;
  let lastError = null;
  for (const url of getRemoteUrlCandidates(client.config.url)) {
    throwIfMcpAborted(options.signal);
    try {
      const session = await openSseSessionAtUrl(withClientUrl(client, url), cacheKey, options);
      mcpSessions.set(cacheKey, session);
      return session;
    } catch (error) {
      if (isMcpAbortError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('SSE MCP 初始化失败。');
}

async function openSseSessionAtUrl(client, cacheKey, options = {}) {
  const response = await fetchMcpHttp(client.config.url, {
    method: 'GET',
    headers: buildSseOpenHeaders(client),
    signal: options.signal
  }, '打开 SSE MCP 连接');
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SSE MCP 连接失败 (${response.status}): ${body || response.statusText}`);
  }
  if (!response.body) throw new Error('SSE MCP 连接没有返回可读取的事件流。');
  const session = {
    sourceUrl: client.config.url,
    messageUrl: '',
    reader: response.body.getReader(),
    decoder: new TextDecoder(),
    buffer: '',
    eventName: '',
    dataLines: [],
    endpointWaiters: [],
    pending: new Map(),
    initializedAt: 0
  };
  pumpSseSession(session).catch(error => rejectAllSsePending(session, error));
  await waitForSseEndpoint(session, client.config.timeout, options.signal);
  const initRequest = createJsonRpcRequest('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'Fritia Online CHAT',
      version: '0.1.0'
    }
  });
  const initPending = waitForSseMessage(session, initRequest.id, client.config.sse_read_timeout, options.signal);
  const initDirect = await postSseMessage(client, session, initRequest, '初始化 SSE MCP', options);
  parseMcpJsonRpcResponse(initDirect || await initPending, initRequest.id);
  await postSseMessage(client, session, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  }, '发送 SSE MCP initialized 通知', options).catch(() => {});
  session.initializedAt = Date.now();
  return session;
}

async function postSseMessage(client, session, request, actionLabel, options = {}) {
  if (!session.messageUrl) throw new Error('SSE MCP 未提供消息 POST endpoint。');
  const response = await fetchMcpHttp(session.messageUrl, {
    method: 'POST',
    headers: buildMcpHeaders(client),
    body: JSON.stringify(request),
    signal: options.signal
  }, actionLabel);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${actionLabel}失败 (${response.status}): ${body || response.statusText}`);
  }
  if (!request.id || response.status === 202 || response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('text/event-stream')) return null;
  const direct = await readMcpResponse(response, request.id);
  return Object.keys(direct || {}).length ? direct : null;
}

async function pumpSseSession(session) {
  while (true) {
    const { done, value } = await session.reader.read();
    if (done) break;
    session.buffer += session.decoder.decode(value, { stream: true });
    const lines = session.buffer.split(/\r?\n/);
    session.buffer = lines.pop() || '';
    for (const line of lines) handleSseSessionLine(session, line);
  }
  rejectAllSsePending(session, new Error('SSE MCP 连接已结束。'));
}

function handleSseSessionLine(session, line) {
  if (line.startsWith('event:')) {
    session.eventName = line.slice(6).trim();
    return;
  }
  if (line.startsWith('data:')) {
    session.dataLines.push(line.slice(5).trim());
    return;
  }
  if (line.trim()) return;
  const eventName = session.eventName;
  const data = session.dataLines.join('\n').trim();
  session.eventName = '';
  session.dataLines = [];
  if (!data || data === '[DONE]') return;
  if (eventName === 'endpoint' || looksLikeSseEndpoint(data)) {
    session.messageUrl = new URL(data, session.sourceUrl).toString();
    resolveSseEndpoint(session);
    return;
  }
  try {
    const message = JSON.parse(data);
    const id = String(message?.id || '');
    const pending = session.pending.get(id);
    if (pending) {
      session.pending.delete(id);
      pending.resolve(message);
    }
  } catch {}
}

function looksLikeSseEndpoint(data) {
  return data.startsWith('/') || data.startsWith('http://') || data.startsWith('https://');
}

function waitForSseEndpoint(session, timeoutSeconds = 10, signal = null) {
  if (session.messageUrl) return Promise.resolve(session.messageUrl);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createMcpAbortError());
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      session.endpointWaiters = session.endpointWaiters.filter(waiter => waiter.reject !== reject);
      reject(new Error('SSE MCP 未在超时内返回 endpoint 事件。'));
    }, normalizeNumber(timeoutSeconds, 1, 120, 10) * 1000);
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const abort = () => {
      globalThis.clearTimeout(timeout);
      session.endpointWaiters = session.endpointWaiters.filter(waiter => waiter.reject !== reject);
      cleanup();
      reject(createMcpAbortError());
    };
    signal?.addEventListener?.('abort', abort, { once: true });
    session.endpointWaiters.push({
      resolve: value => {
        globalThis.clearTimeout(timeout);
        cleanup();
        resolve(value);
      },
      reject: error => {
        cleanup();
        reject(error);
      }
    });
  });
}

function resolveSseEndpoint(session) {
  const waiters = session.endpointWaiters.splice(0);
  waiters.forEach(waiter => waiter.resolve(session.messageUrl));
}

function waitForSseMessage(session, id, timeoutSeconds = 300, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createMcpAbortError());
      return;
    }
    const key = String(id);
    const timeout = globalThis.setTimeout(() => {
      session.pending.delete(key);
      reject(new Error(`SSE MCP 等待 JSON-RPC 响应超时：${key}`));
    }, normalizeNumber(timeoutSeconds, 10, 3600, 300) * 1000);
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const abort = () => {
      globalThis.clearTimeout(timeout);
      session.pending.delete(key);
      cleanup();
      reject(createMcpAbortError());
    };
    signal?.addEventListener?.('abort', abort, { once: true });
    session.pending.set(key, {
      resolve: value => {
        globalThis.clearTimeout(timeout);
        cleanup();
        resolve(value);
      },
      reject: error => {
        globalThis.clearTimeout(timeout);
        cleanup();
        reject(error);
      }
    });
  });
}

function clearSsePending(session, id) {
  session.pending.delete(String(id));
}

function rejectAllSsePending(session, error) {
  session.endpointWaiters.splice(0).forEach(waiter => waiter.reject(error));
  session.pending.forEach(waiter => waiter.reject(error));
  session.pending.clear();
}

async function sendStdioRelayRequest(client, method, params = {}, options = {}) {
  const request = createJsonRpcRequest(method, params);
  if (typeof window !== 'undefined' && window.__FRITIA_MCP_RELAY__?.request) {
    throwIfMcpAborted(options.signal);
    const response = await window.__FRITIA_MCP_RELAY__.request({
      client: client.config,
      request
    });
    throwIfMcpAborted(options.signal);
    return parseMcpJsonRpcResponse(getNativeRelayResponse(response), request.id);
  }
  const relayUrl = client.config.relayUrl || DEFAULT_RELAY_URL;
  const response = await fetch(relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      server: {
        command: client.config.command,
        args: client.config.args || [],
        env: client.config.env || {},
        cwd: client.config.cwd || '',
        timeout: client.config.timeout || DEFAULT_STDIO_CONFIG.timeout
      },
      request
    })
  });
  return parseMcpJsonRpcResponse(getNativeRelayResponse(await response.json()), request.id);
}

function throwIfMcpAborted(signal) {
  if (!signal?.aborted) return;
  throw createMcpAbortError();
}

function createMcpAbortError() {
  const error = new Error('用户已停止工具调用。');
  error.name = 'AbortError';
  return error;
}

function isMcpAbortError(error) {
  return error?.name === 'AbortError' || error?.message === '用户已停止工具调用。';
}

function buildMcpHeaders(client, sessionId = '') {
  const configuredHeaders = client.config.headers && typeof client.config.headers === 'object'
    ? client.config.headers
    : {};
  return {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    ...configuredHeaders,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
  };
}

function buildSseOpenHeaders(client) {
  const configuredHeaders = client.config.headers && typeof client.config.headers === 'object'
    ? client.config.headers
    : {};
  return {
    Accept: 'text/event-stream',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    ...configuredHeaders
  };
}

async function readMcpResponse(response, expectedId = null) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`MCP 请求失败 (${response.status}): ${body || response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.includes('text/event-stream') && response.body) {
    return readMcpSseStream(response.body, expectedId);
  }
  const text = await response.text();
  return parseSseJsonRpc(text);
}

async function readMcpSseStream(body, expectedId = null) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventLines = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const parsed = parseSseLine(line, eventLines, expectedId);
      if (parsed) return parsed;
      if (!line.trim()) eventLines = [];
    }
  }
  if (buffer.trim()) {
    const parsed = parseSseLine('', [...eventLines, buffer], expectedId);
    if (parsed) return parsed;
  }
  return {};
}

function parseSseLine(line, eventLines, expectedId = null) {
  if (line.startsWith('data:')) {
    eventLines.push(line.slice(5).trim());
    return null;
  }
  if (line.trim()) return null;
  const payload = eventLines.join('\n').trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const parsed = JSON.parse(payload);
    if (!expectedId || parsed?.id === expectedId) return parsed;
  } catch {}
  return null;
}

function parseSseJsonRpc(text = '') {
  const events = [];
  let current = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length) {
        events.push(current.join('\n'));
        current = [];
      }
      continue;
    }
    if (line.startsWith('data:')) current.push(line.slice(5).trim());
  }
  if (current.length) events.push(current.join('\n'));
  for (const event of events) {
    if (!event || event === '[DONE]') continue;
    try {
      return JSON.parse(event);
    } catch {}
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function parseMcpJsonRpcResponse(response, id) {
  if (response && typeof response === 'object' && !Array.isArray(response) && !response.jsonrpc && 'response' in response) {
    return parseMcpJsonRpcResponse(getNativeRelayResponse(response), id);
  }
  if (Array.isArray(response)) {
    const matched = response.find(item => item.id === id) || response[0];
    return parseMcpJsonRpcResponse(matched, id);
  }
  if (response?.error) {
    throw new Error(response.error.message || JSON.stringify(response.error));
  }
  const result = response?.result || response || {};
  const changedFiles = normalizeNativeChangedFiles(response?.changedFiles || response?.changed_files || response?.files);
  if (changedFiles.length && result && typeof result === 'object' && !Array.isArray(result)) {
    const existing = normalizeNativeChangedFiles(result.changedFiles || result.changed_files || result.files);
    return {
      ...result,
      changedFiles: [...existing, ...changedFiles]
    };
  }
  return result;
}

function createJsonRpcRequest(method, params = {}) {
  return {
    jsonrpc: '2.0',
    id: createId('mcp_rpc'),
    method,
    params
  };
}

async function assertMcpPermission(client, toolName, args) {
  const config = getMcpConfig();
  const clientPermission = ['ask', 'allow', 'off'].includes(client.permission) ? client.permission : '';
  const globalLevel = ['ask', 'allow', 'off'].includes(config.permissions.level) ? config.permissions.level : 'ask';
  const level = clientPermission === 'off' ? 'off' : globalLevel;
  if (level === 'off') throw new Error('当前权限设置禁止 MCP 调用。');
  if (isRemoteMcpTransport(client.transport) && !config.permissions.allowRemoteHttp) {
    throw new Error('权限设置禁止远程 HTTP MCP。');
  }
  if (client.transport === MCP_TRANSPORTS.STDIO && !config.permissions.allowLocalStdio) {
    throw new Error('权限设置禁止本地 Stdio MCP。');
  }
  if ((level === 'ask' || config.permissions.requireManualApproval) && typeof window !== 'undefined') {
    const ok = window.confirm(`允许 ${client.name} 调用工具 ${toolName}？\n\n参数：${JSON.stringify(args, null, 2).slice(0, 800)}`);
    if (!ok) throw new Error('用户拒绝 MCP 工具调用。');
  }
}

async function assertWebMcpPermission(name, args) {
  const config = getMcpConfig();
  if (config.webMcpServer.requireConfirmation && typeof window !== 'undefined') {
    const ok = window.confirm(`允许外部 Agent 调用 ${name}？\n\n参数：${JSON.stringify(args, null, 2).slice(0, 800)}`);
    if (!ok) throw new Error('用户拒绝 WebMCP 调用。');
  }
}

function normalizeMcpConfig(raw = {}) {
  const rawClients = Array.isArray(raw.clients) && raw.clients.length
    ? raw.clients.map(normalizeMcpClient).filter(Boolean)
    : DEFAULT_MCP_CONFIG.clients.map(normalizeMcpClient);
  const clients = ensureBuiltinFilesystemClient(rawClients);
  return {
    version: 1,
    selectedClientIdsByConversation: normalizeSelectedMap(raw.selectedClientIdsByConversation),
    webMcpServer: {
      ...DEFAULT_MCP_CONFIG.webMcpServer,
      ...(raw.webMcpServer && typeof raw.webMcpServer === 'object' ? raw.webMcpServer : {})
    },
    clients,
    permissions: {
      ...DEFAULT_MCP_CONFIG.permissions,
      ...(raw.permissions && typeof raw.permissions === 'object' ? raw.permissions : {})
    },
    logs: Array.isArray(raw.logs) ? raw.logs.map(normalizeMcpLog).slice(0, MAX_LOGS) : []
  };
}

function normalizeMcpClient(raw = {}) {
  const hasConfigJsonField = ['configJson', 'rawConfigJson', 'serverConfigJson'].some(key => Object.prototype.hasOwnProperty.call(raw, key))
    || Object.prototype.hasOwnProperty.call(raw.config || {}, 'configJson');
  const configJson = normalizeConfigJson(raw.configJson || raw.rawConfigJson || raw.serverConfigJson || raw.config?.configJson);
  let parsedConfig = null;
  if (configJson) {
    try {
      parsedConfig = parseMcpServerConfigJson(configJson, raw.transport || raw.config?.transport);
    } catch {}
  }
  const transport = normalizeTransport(parsedConfig?.transport || raw.transport || raw.config?.transport);
  const fallback = transport === MCP_TRANSPORTS.STDIO ? DEFAULT_STDIO_CONFIG : DEFAULT_STREAMABLE_CONFIG;
  const id = String(raw.id || raw.name || createId('mcp')).trim().replace(/\s+/g, '-').slice(0, 80) || createId('mcp');
  const runtimeConfig = parsedConfig || raw.config || {};
  const name = String(raw.name || parsedConfig?.name || id).trim().slice(0, 80) || id;
  return {
    id,
    name,
    enabled: raw.enabled !== false,
    transport,
    permission: ['ask', 'allow', 'off'].includes(raw.permission) ? raw.permission : 'ask',
    config: normalizeClientConfig({ ...fallback, ...runtimeConfig, transport }, transport),
    configJson: configJson || (hasConfigJsonField
      ? ''
      : transport === MCP_TRANSPORTS.STDIO
      ? formatMcpServerConfigJson({ ...fallback, ...runtimeConfig, transport }, transport, name)
      : ''),
    builtin: String(raw.builtin || ''),
    hiddenFromPicker: raw.hiddenFromPicker === true,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
  };
}

async function assertMcpFileWritePermission(client, toolName, args) {
  const config = getMcpConfig();
  if (!config.permissions.requireFileWriteApproval) return;
  const operations = detectFileMutationOperations(toolName, args);
  if (!operations.length || typeof window === 'undefined') return;
  const details = operations.slice(0, 30).map(item => `- ${item.action}: ${item.path || '未明确路径'}`).join('\n');
  const overflow = operations.length > 30 ? `\n- 还有 ${operations.length - 30} 项未展开` : '';
  const ok = window.confirm([
    `允许 ${client.name} 的工具 ${toolName} 执行文件写入或删除操作？`,
    '',
    details + overflow,
    '',
    `参数：${JSON.stringify(args, null, 2).slice(0, 800)}`
  ].join('\n'));
  if (!ok) throw new Error('用户拒绝文件写入或删除操作。');
}

function detectFileMutationOperations(toolName, args) {
  const paths = collectPotentialFilePaths(args);
  const action = detectMutationAction(toolName, args, paths);
  if (!action) return [];
  if (!paths.length) return [{ action, path: '' }];
  return paths.map(path => ({ action, path }));
}

function detectMutationAction(toolName, args, paths = []) {
  const source = `${toolName || ''} ${collectObjectKeys(args).join(' ')}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(delete|remove|unlink|rmdir|trash|rm)\b/.test(source)) return '删除';
  if (/\b(move|rename|mv)\b/.test(source)) return '移动或重命名';
  if (/\b(copy|cp|duplicate)\b/.test(source)) return '复制';
  if (/\b(write|create|save|append|edit|update|patch|modify|mkdir|touch|upload|replace)\b/.test(source)) return '写入或修改';
  if (paths.length && /\b(screenshot|capture|export|download)\b/.test(source)) return '写入或修改';
  if (paths.length && containsMutationPayload(args)) return '写入或修改';
  return '';
}

function collectObjectKeys(value, keys = []) {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    value.forEach(item => collectObjectKeys(item, keys));
    return keys;
  }
  Object.entries(value).forEach(([key, child]) => {
    keys.push(key);
    collectObjectKeys(child, keys);
  });
  return keys;
}

function containsMutationPayload(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsMutationPayload);
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.toLowerCase();
    if (['content', 'data', 'text', 'bytes', 'patch', 'edits', 'overwrite', 'recursive'].includes(normalizedKey)) return true;
    return containsMutationPayload(child);
  });
}

function collectPotentialFilePaths(value, paths = new Set(), key = '') {
  if (!value || typeof value !== 'object') return [...paths];
  if (Array.isArray(value)) {
    value.forEach(item => {
      if (typeof item === 'string' && looksLikeFilePathKey(key)) paths.add(item);
      collectPotentialFilePaths(item, paths, key);
    });
    return [...paths];
  }
  Object.entries(value).forEach(([key, child]) => {
    if (typeof child === 'string' && looksLikeFilePathKey(key)) {
      paths.add(child);
    } else if (Array.isArray(child) && looksLikeFilePathKey(key)) {
      child.filter(item => typeof item === 'string').forEach(item => paths.add(item));
    }
    collectPotentialFilePaths(child, paths, key);
  });
  return [...paths];
}

function looksLikeFilePathKey(key) {
  return /(^|_|\b)(path|file|filepath|filename|target|destination|dest|source|from|to|dir|directory|folder|output|outputs|input|inputs|paths|files)(\b|_|$)/i.test(String(key || ''));
}

function ensureBuiltinFilesystemClient(clients = []) {
  const environment = getRuntimeEnvironment();
  const pureFrontend = isBrowserFrontendRuntime(environment);
  const existing = clients.find(client => client.id === BUILTIN_FILESYSTEM_MCP_ID);
  const builtin = normalizeMcpClient({
    ...BUILTIN_FILESYSTEM_CLIENT,
    ...(existing || {}),
    id: BUILTIN_FILESYSTEM_MCP_ID,
    name: 'Filesystem',
    enabled: pureFrontend ? false : existing?.enabled !== false,
    transport: MCP_TRANSPORTS.STDIO,
    permission: 'allow',
    config: { ...DEFAULT_STDIO_CONFIG },
    configJson: BUILTIN_FILESYSTEM_CONFIG_JSON,
    builtin: 'filesystem',
    hiddenFromPicker: true
  });
  const rest = clients.filter(client => client.id !== BUILTIN_FILESYSTEM_MCP_ID);
  return [...rest, builtin];
}

function withImplicitFilesystemClientIds(clientIds = []) {
  const selected = [...new Set((Array.isArray(clientIds) ? clientIds : []).map(String).filter(Boolean))];
  if (!selected.length) return selected;
  const builtin = getMcpConfig().clients.find(client => client.id === BUILTIN_FILESYSTEM_MCP_ID);
  if (builtin?.enabled && !selected.includes(BUILTIN_FILESYSTEM_MCP_ID)) {
    selected.push(BUILTIN_FILESYSTEM_MCP_ID);
  }
  return selected;
}

function normalizeClientConfig(config = {}, transport) {
  if (transport === MCP_TRANSPORTS.STDIO) {
    return {
      transport,
      command: String(config.command || '').trim(),
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      env: config.env && typeof config.env === 'object' && !Array.isArray(config.env) ? config.env : {},
      cwd: String(config.cwd || ''),
      relayUrl: String(config.relayUrl || DEFAULT_RELAY_URL).trim(),
      timeout: normalizeNumber(config.timeout, 1, 600, DEFAULT_STDIO_CONFIG.timeout)
    };
  }
  return {
    transport: normalizeTransport(transport),
    url: String(config.url || DEFAULT_STREAMABLE_CONFIG.url).trim(),
    headers: config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers) ? config.headers : {},
    timeout: normalizeNumber(config.timeout, 1, 120, DEFAULT_STREAMABLE_CONFIG.timeout),
    sse_read_timeout: normalizeNumber(config.sse_read_timeout, 10, 3600, DEFAULT_STREAMABLE_CONFIG.sse_read_timeout)
  };
}

function normalizeSelectedMap(raw = {}) {
  const map = {};
  if (!raw || typeof raw !== 'object') return map;
  Object.entries(raw).forEach(([key, value]) => {
    map[key] = Array.isArray(value) ? value.map(String) : [];
  });
  return map;
}

function normalizeMcpLog(raw = {}) {
  return {
    id: raw.id || createId('mcp_log'),
    source: String(raw.source || 'mcp').slice(0, 80),
    clientId: String(raw.clientId || ''),
    toolName: String(raw.toolName || ''),
    args: raw.args && typeof raw.args === 'object' ? raw.args : {},
    result: String(raw.result || ''),
    status: ['running', 'success', 'error', 'denied'].includes(raw.status) ? raw.status : 'success',
    createdAt: Number(raw.createdAt) || Date.now(),
    finishedAt: Number(raw.finishedAt) || 0
  };
}

function normalizeTransport(value) {
  if (value === MCP_TRANSPORTS.STDIO) return MCP_TRANSPORTS.STDIO;
  if (value === MCP_TRANSPORTS.SSE) return MCP_TRANSPORTS.SSE;
  return MCP_TRANSPORTS.STREAMABLE_HTTP;
}

function normalizeNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeJsonSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { type: 'object', properties: {} };
  return {
    type: schema.type || 'object',
    properties: schema.properties && typeof schema.properties === 'object' ? schema.properties : {},
    ...(Array.isArray(schema.required) ? { required: schema.required } : {})
  };
}

function createOpenAiToolName(client, tool, registry) {
  const base = `${safeToolPart(client.name || client.id)}__${safeToolPart(tool.name)}`.slice(0, 56) || 'mcp_tool';
  let name = base;
  let index = 2;
  while (registry[name]) {
    name = `${base.slice(0, 52)}_${index}`;
    index += 1;
  }
  return name;
}

function safeToolPart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'mcp';
}

function compactDescription(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 900);
}

if (!STORAGE_KEYS.mcpTools) {
  STORAGE_KEYS.mcpTools = MCP_CONFIG_KEY;
}
