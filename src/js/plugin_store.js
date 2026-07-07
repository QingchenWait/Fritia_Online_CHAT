export const MODELSCOPE_ORIGIN = 'https://www.modelscope.cn';
export const MODELSCOPE_MCP_PAGE_URL = `${MODELSCOPE_ORIGIN}/mcp?hosted=1`;
export const MODELSCOPE_LOGIN_URL = `${MODELSCOPE_ORIGIN}/mcp?hosted=1`;
export const MODELSCOPE_MCP_ICON = 'src/_logo/icons/network.svg';

const MODELSCOPE_API_PREFIX = `${MODELSCOPE_ORIGIN}/api/v1`;
const MODELSCOPE_ENV_FIELD_SCOPE = 'env';
const MODELSCOPE_DEPLOY_FIELD_SCOPE = 'deploy';
const MODELSCOPE_PLATFORM_INFRA_SOURCE = 'platform';
const MODELSCOPE_DEPLOY_POLL_INTERVAL_MS = 2000;
const MODELSCOPE_DEPLOY_MAX_POLLS = 60;
const MODELSCOPE_TRANSPORT_LABELS = {
  streamable_http: 'Streamable HTTP',
  sse: 'SSE'
};
const MODELSCOPE_AUTH_OPTIONS = [
  { value: 'none', label: '无鉴权' },
  { value: 'bearer', label: 'Bearer Token' }
];
const MODELSCOPE_EXPIRATION_OPTIONS = [
  { value: '-1', label: '长期有效' },
  { value: '1440', label: '24小时有效' },
  { value: '60', label: '1小时有效' }
];

export async function checkModelScopeLogin(signal) {
  const payload = await modelScopeFetch('/users/login/info', { signal, allowApiError: true });
  const data = payload?.Data || {};
  return {
    connected: Boolean(payload?.Success && (data.Id || data.id || data.Name || data.name || data.NickName)),
    user: data,
    message: payload?.Message || ''
  };
}

export async function fetchHostedModelScopeMcps({ page = 1, pageSize = 12, query = '', signal } = {}) {
  const body = {
    PageSize: pageSize,
    PageNumber: page,
    Query: query,
    Criterion: [
      {
        Category: 'Hosted',
        Predicate: 'contains',
        BoolValues: [true]
      }
    ]
  };
  const payload = await modelScopeFetch('/dolphin/mcpServers', { method: 'PUT', body, signal });
  const mcpServer = payload?.Data?.McpServer || {};
  const items = Array.isArray(mcpServer.McpServers) ? mcpServer.McpServers : [];
  return {
    total: Number(mcpServer.TotalCount) || items.length,
    items: items.map(normalizeModelScopeMcp)
  };
}

export async function fetchModelScopeMcpDetail(server, signal) {
  const normalized = normalizeModelScopeMcp(server);
  const payload = await modelScopeFetch(
    `/mcpServers/${encodeSegment(normalized.path)}/${encodeSegment(normalized.name)}`,
    { signal }
  );
  return normalizeModelScopeMcpDetail({
    ...normalized,
    ...(payload?.Data || {})
  });
}

export async function deployModelScopeMcp(server, environmentVariables = {}, options = {}) {
  const normalized = normalizeModelScopeMcp(server);
  const transportType = normalizeTransportType(options.transportType, normalized.supportedTransportTypes || normalized.SupportedDeployTransportType);
  const deploymentJobId = await resolveModelScopeDeploymentJobId(normalized);
  const body = {
    Path: normalized.path,
    Name: normalized.name,
    EnvironmentVariables: environmentVariables,
    Reset: false,
    DeployTest: false,
    ExpirationMinutes: normalizeExpirationMinutes(options.expirationMinutes),
    TransportType: transportType,
    AuthCheck: Boolean(options.authCheck),
    InfraSource: MODELSCOPE_PLATFORM_INFRA_SOURCE,
    DeploymentJobId: deploymentJobId
  };
  const payload = await modelScopeFetch(
    `/mcpServers/${encodeSegment(normalized.path)}/${encodeSegment(normalized.name)}/asyncDeploy`,
    { method: 'POST', body }
  );
  const deployPayload = await waitForModelScopeDeployResult(deploymentJobId, payload);
  let deployUrl = extractDeployUrl(deployPayload) || extractDeployUrl(payload);
  if (!deployUrl) {
    deployUrl = normalized.deployedUrl || normalized.streamableHttpUrl || normalized.sseUrl || '';
  }
  if (!deployUrl) {
    throw new Error('魔搭未返回可用的远程 MCP URL。');
  }
  const mcpDeployInfo = deployPayload?.Data?.McpDeployInfo || payload?.Data?.McpDeployInfo || {};
  return {
    url: deployUrl,
    transportType: normalizeTransportValue(mcpDeployInfo.TransportType) || transportType,
    authCheck: Boolean(mcpDeployInfo.AuthCheck ?? deployPayload?.Data?.AuthCheck ?? payload?.Data?.AuthCheck ?? options.authCheck),
    expiration: mcpDeployInfo.Expiration || deployPayload?.Data?.Expiration || payload?.Data?.Expiration || null,
    raw: deployPayload || payload
  };
}

export function buildModelScopeMcpConfig(server, deployResult, options = {}) {
  const normalized = normalizeModelScopeMcp(server);
  const serverName = normalized.displayName || normalized.name || 'ModelScope MCP';
  const item = {
    type: deployResult?.transportType || 'streamable_http',
    url: deployResult?.url || normalized.deployedUrl || ''
  };
  if (options.bearerToken) {
    item.headers = {
      Authorization: `Bearer ${options.bearerToken}`
    };
  }
  return JSON.stringify({ mcpServers: { [serverName]: item } }, null, 2);
}

export function normalizeModelScopeMcpDetail(raw = {}) {
  const normalized = normalizeModelScopeMcp(raw);
  const supportedTransportTypes = normalizeSupportedTransportTypes(raw.SupportedDeployTransportType || raw.supportedTransportTypes);
  const schema = selectModelScopeServiceSchema(raw, supportedTransportTypes);
  const schemaFields = normalizeSchemaFields(schema);
  const deployFields = createModelScopeDeployFields(supportedTransportTypes, raw);
  return {
    ...normalized,
    readme: raw.Readme || raw.README || raw.Description || raw.Abstract || normalized.description,
    serviceFields: [
      deployFields[0],
      ...schemaFields,
      ...deployFields.slice(1)
    ],
    serviceSchema: schema,
    serverConfig: parseMaybeJson(raw.StreamableHTTPServerConfig || raw.SSEServerConfig || raw.ServerConfig),
    supportedTransportTypes,
    authCheck: Boolean(raw.DeployedUrlAuthCheck),
    deployedUrl: raw.DeployedUrl || normalized.deployedUrl || '',
    deployedUrlTransportType: raw.DeployedUrlTransportType || ''
  };
}

export function normalizeModelScopeMcp(raw = {}) {
  const name = String(raw.Name || raw.name || '').trim();
  const fromSitePath = String(raw.FromSitePath || raw.fromSitePath || '').trim();
  const path = String(raw.Path || raw.path || (fromSitePath ? `@${fromSitePath}` : '')).trim();
  const displayName = String(raw.ChineseName || raw.DisplayName || raw.displayName || name || 'MCP 服务').trim();
  const description = String(
    raw.OriginalAbstract
    || raw.AbstractCN
    || raw.Abstract
    || raw.Description
    || raw.description
    || ''
  ).trim();
  return {
    ...raw,
    id: `${path || 'modelscope'}/${name || displayName}`,
    name,
    path,
    displayName,
    description,
    owner: raw.NickName || raw.Owner || raw.Path || raw.FromSitePath || 'modelscope',
    icon: normalizeAssetUrl(raw.FromSiteIcon || raw.Cover || raw.Icon || raw.icon) || MODELSCOPE_MCP_ICON,
    tags: normalizeTags(raw.Tags || raw.Category || raw.Categories),
    hosted: raw.Hosted !== false,
    verified: Boolean(raw.Verifed || raw.Verified),
    callVolume: Number(raw.CallVolume) || 0,
    viewCount: Number(raw.ViewCount) || 0,
    deployedUrl: raw.DeployedUrl || raw.Url || '',
    streamableHttpUrl: raw.StreamableHTTPUrl || '',
    sseUrl: raw.SSEUrl || '',
    detailUrl: `${MODELSCOPE_ORIGIN}/mcp/servers/${encodePathPart(path)}/${encodePathPart(name)}`
  };
}

async function resolveModelScopeDeploymentJobId(server) {
  const fallback = `${server.path}/${server.name}/platform-pool`;
  try {
    const payload = await modelScopeFetch(
      `/mcpServers/${encodeSegment(server.path)}/${encodeSegment(server.name)}/listByStatus`
    );
    const deployServers = payload?.Data?.McpDeployServers || payload?.McpDeployServers || [];
    const platformServer = Array.isArray(deployServers)
      ? deployServers.find(item => String(item?.InfraSource || '').toLowerCase() === MODELSCOPE_PLATFORM_INFRA_SOURCE)
      : null;
    return String(platformServer?.DeploymentJobId || fallback).trim();
  } catch (error) {
    console.warn('[plugin-store] Failed to read ModelScope deployment job id, using platform-pool fallback', error);
    return fallback;
  }
}

async function waitForModelScopeDeployResult(deploymentJobId, initialPayload) {
  let payload = initialPayload;
  if (extractDeployUrl(payload)) return payload;
  for (let attempt = 0; attempt < MODELSCOPE_DEPLOY_MAX_POLLS; attempt += 1) {
    if (attempt > 0) await delay(MODELSCOPE_DEPLOY_POLL_INTERVAL_MS);
    payload = await modelScopeFetch('/mcpServers/deployStatus', {
      method: 'POST',
      body: { DeploymentJobId: deploymentJobId },
      allowApiError: true
    });
    if (payload?.Success === false) {
      throw new Error(payload?.Data?.Message || payload?.Message || '魔搭部署状态返回失败。');
    }
    const code = Number(payload?.Data?.Code ?? payload?.Code);
    if (Number.isFinite(code) && code !== 200) {
      throw new Error(payload?.Data?.Message || payload?.Message || '魔搭部署状态返回失败。');
    }
    const status = normalizeDeployStatus(payload?.Data?.DeployStatus || payload?.Data?.Status || payload?.DeployStatus || payload?.Status);
    const deployUrl = extractDeployUrl(payload);
    if (status === 'published' && deployUrl) return payload;
    if (status === 'failed') {
      throw new Error(payload?.Data?.Message || payload?.Message || '魔搭 MCP 连接失败。');
    }
  }
  return payload;
}

async function modelScopeFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'x-modelscope-accept-language': 'zh_CN',
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  };
  const url = buildModelScopeApiUrl(path);
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;
  let response;
  try {
    response = await requestModelScope(url, { method, headers, body, signal: options.signal });
  } catch (error) {
    throw new Error(`无法访问魔搭社区接口：${error?.message || '网络或 CORS 受限'}`);
  }
  const text = response.text;
  const payload = parseApiPayload(text);
  if (!response.ok && !options.allowApiError) {
    throw new Error(payload?.Message || `魔搭接口返回 HTTP ${response.status}`);
  }
  if (payload?.Success === false && !options.allowApiError) {
    throw new Error(payload.Message || '魔搭接口返回失败。');
  }
  return payload;
}

async function requestModelScope(url, init = {}) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return requestModelScopeViaTauri(invoke, url, init);
  }
  const response = await fetch(url, {
    method: init.method || 'GET',
    credentials: 'include',
    headers: init.headers,
    body: init.body,
    signal: init.signal
  });
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText || '',
    text: await response.text()
  };
}

async function requestModelScopeViaTauri(invoke, url, init = {}) {
  if (init.signal?.aborted) throw createAbortError();
  const nativeResponse = await invoke('modelscope_fetch', {
    request: {
      url,
      method: init.method || 'GET',
      headers: Object.entries(init.headers || {}).map(([name, value]) => ({ name, value })),
      bodyBase64: init.body ? encodeUtf8Base64(init.body) : null
    }
  });
  if (init.signal?.aborted) throw createAbortError();
  const status = Number(nativeResponse?.status) || 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: nativeResponse?.statusText || nativeResponse?.status_text || '',
    text: decodeUtf8Base64(nativeResponse?.bodyBase64 || nativeResponse?.body_base64 || '')
  };
}

function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

function buildModelScopeApiUrl(path) {
  const value = String(path || '');
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (normalized.startsWith('/api/')) return `${MODELSCOPE_ORIGIN}${normalized}`;
  if (normalized.startsWith('/v1/')) return `${MODELSCOPE_ORIGIN}/api${normalized}`;
  return `${MODELSCOPE_API_PREFIX}${normalized}`;
}

function parseApiPayload(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const body = String(text || '');
    const title = body.match(/<title>(.*?)<\/title>/i)?.[1];
    const waf = body.includes('aliyun_waf')
      || body.includes('acw_sc__v2')
      || body.includes('aliyun_waf_aa')
      || body.includes('fourier.taobao.com');
    console.warn('[plugin-store] ModelScope returned non-JSON content', {
      title: title || '',
      preview: body.replace(/\s+/g, ' ').slice(0, 240)
    });
    throw new Error(waf ? '魔搭接口受到登录或 WAF 保护，请先在魔搭社区完成登录。' : (title || '魔搭接口返回了非 JSON 内容。'));
  }
}

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeUtf8Base64(value) {
  if (!value) return '';
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function createAbortError() {
  const error = new Error('请求已取消。');
  error.name = 'AbortError';
  return error;
}

function parseSchema(value) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return { type: 'object', properties: {}, required: [] };
}

function selectModelScopeServiceSchema(raw = {}, supportedTransportTypes = []) {
  const envSchema = parseSchema(raw.EnvSchema || raw.envSchema);
  const streamableHttpSchema = parseSchema(raw.StreamableHTTPParameterSchema || raw.streamableHTTPParameterSchema);
  const sseSchema = parseSchema(raw.SSEParameterSchema || raw.sseParameterSchema);
  const parameterSchema = parseSchema(raw.ParameterSchema || raw.parameterSchema);
  if (supportedTransportTypes.length >= 2 && hasSchemaFields(envSchema)) return envSchema;
  if (supportedTransportTypes.includes('streamable_http') && hasSchemaFields(streamableHttpSchema)) return streamableHttpSchema;
  if (supportedTransportTypes.includes('sse') && hasSchemaFields(sseSchema)) return sseSchema;
  return [envSchema, streamableHttpSchema, sseSchema, parameterSchema].find(hasSchemaFields) || envSchema;
}

function hasSchemaFields(schema = {}) {
  return Boolean(schema.properties && typeof schema.properties === 'object' && Object.keys(schema.properties).length);
}

function createModelScopeDeployFields(supportedTransportTypes = [], raw = {}) {
  const transportTypes = supportedTransportTypes.length ? supportedTransportTypes : ['streamable_http'];
  return [
    {
      key: '__modelscope_transport_type',
      scope: MODELSCOPE_DEPLOY_FIELD_SCOPE,
      label: '传输类型',
      type: 'string',
      description: 'Hosted MCP 远程连接方式',
      defaultValue: normalizeTransportType(raw.DeployedUrlTransportType || raw.deployedUrlTransportType, transportTypes),
      enum: transportTypes,
      options: transportTypes.map(value => ({ value, label: MODELSCOPE_TRANSPORT_LABELS[value] || value })),
      required: true
    },
    {
      key: '__modelscope_auth_type',
      scope: MODELSCOPE_DEPLOY_FIELD_SCOPE,
      label: '鉴权类型',
      type: 'string',
      description: '远程服务 URL 鉴权方式',
      defaultValue: raw.DeployedUrlAuthCheck || raw.authCheck ? 'bearer' : 'none',
      enum: MODELSCOPE_AUTH_OPTIONS.map(option => option.value),
      options: MODELSCOPE_AUTH_OPTIONS,
      required: false
    },
    {
      key: '__modelscope_expiration',
      scope: MODELSCOPE_DEPLOY_FIELD_SCOPE,
      label: '有效期',
      type: 'string',
      description: '远程服务配置有效期',
      defaultValue: '-1',
      enum: MODELSCOPE_EXPIRATION_OPTIONS.map(option => option.value),
      options: MODELSCOPE_EXPIRATION_OPTIONS,
      required: false
    }
  ];
}

function normalizeSchemaFields(schema = {}) {
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(properties).map(([key, value]) => {
    const meta = value && typeof value === 'object' ? value : {};
    const type = Array.isArray(meta.type) ? meta.type[0] : meta.type;
    return {
      key,
      scope: MODELSCOPE_ENV_FIELD_SCOPE,
      label: meta.title || key,
      type: normalizeFieldType(type),
      description: meta.description || '',
      placeholder: meta.placeholder || meta.description || '',
      defaultValue: meta.default ?? meta.test_value ?? '',
      enum: Array.isArray(meta.enum) ? meta.enum : [],
      required: required.has(key)
    };
  });
}

function normalizeFieldType(type) {
  if (type === 'boolean') return 'boolean';
  if (type === 'number' || type === 'integer') return 'number';
  return 'string';
}

function normalizeTransportType(value, supportedTypes = []) {
  const supported = normalizeSupportedTransportTypes(supportedTypes);
  const normalized = normalizeTransportValue(value);
  if (normalized && (!supported.length || supported.includes(normalized))) return normalized;
  if (supported.includes('streamable_http')) return 'streamable_http';
  if (supported.length) return supported[0];
  return 'streamable_http';
}

function normalizeSupportedTransportTypes(value) {
  const parsed = parseMaybeJson(value);
  const source = Array.isArray(parsed) ? parsed : (Array.isArray(value) ? value : String(value || '').split(/[,，\s]+/));
  return source
    .map(normalizeTransportValue)
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeTransportValue(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'streamable_http' || normalized === 'sse') return normalized;
  return '';
}

function normalizeExpirationMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : -1;
}

function normalizeDeployStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function delay(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeAssetUrl(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const url = typeof source === 'object' && source ? source.url || source.path : source;
  if (!url) return '';
  const text = String(url);
  if (text.startsWith('//')) return `https:${text}`;
  if (text.startsWith('/')) return `${MODELSCOPE_ORIGIN}${text}`;
  return text;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).slice(0, 4);
  if (typeof value === 'string') return value.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean).slice(0, 4);
  return [];
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function extractDeployUrl(payload) {
  return payload?.Data?.Url
    || payload?.Data?.url
    || payload?.Data?.DeployedUrl
    || extractNested(payload, ['Data', 'McpDeployInfo', 'Url'])
    || extractNested(payload, ['Data', 'McpDeployInfo', 'url'])
    || '';
}

function extractNested(value, path) {
  return path.reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), value);
}

function encodeSegment(value) {
  return encodeURIComponent(String(value || '').trim());
}

function encodePathPart(value) {
  return String(value || '').split('/').map(encodeURIComponent).join('/');
}
