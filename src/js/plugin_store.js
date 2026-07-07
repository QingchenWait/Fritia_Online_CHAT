export const MODELSCOPE_ORIGIN = 'https://www.modelscope.cn';
export const MODELSCOPE_MCP_PAGE_URL = `${MODELSCOPE_ORIGIN}/mcp?hosted=1`;
export const MODELSCOPE_LOGIN_URL = `${MODELSCOPE_ORIGIN}/mcp?hosted=1`;
export const MODELSCOPE_MCP_ICON = 'src/_logo/icons/network.svg';

const MODELSCOPE_API_PREFIX = `${MODELSCOPE_ORIGIN}/api/v1`;

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
  const payload = await modelScopeFetch('/dolphin/mcpServers', { method: 'POST', body, signal });
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
  const body = {
    Path: normalized.path,
    Name: normalized.name,
    EnvironmentVariables: environmentVariables,
    Reset: false,
    DeployTest: false,
    ExpirationMinutes: options.expirationMinutes ?? 1440,
    TransportType: 'streamable_http',
    AuthCheck: Boolean(options.authCheck),
    InfraSource: 'platform'
  };
  let payload = await modelScopeFetch(
    `/mcpServers/${encodeSegment(normalized.path)}/${encodeSegment(normalized.name)}/deploy`,
    { method: 'POST', body }
  );
  let deployUrl = extractDeployUrl(payload);
  if (!deployUrl) {
    payload = await modelScopeFetch(
      `/mcpServers/${encodeSegment(normalized.path)}/${encodeSegment(normalized.name)}/asyncDeploy`,
      { method: 'POST', body }
    );
    deployUrl = extractDeployUrl(payload);
  }
  if (!deployUrl) {
    deployUrl = normalized.deployedUrl || normalized.streamableHttpUrl || normalized.sseUrl || '';
  }
  if (!deployUrl) {
    throw new Error('魔搭未返回可用的远程 MCP URL。');
  }
  return {
    url: deployUrl,
    transportType: 'streamable_http',
    authCheck: Boolean(extractNested(payload, ['Data', 'McpDeployInfo', 'AuthCheck']) || payload?.Data?.AuthCheck),
    expiration: extractNested(payload, ['Data', 'McpDeployInfo', 'Expiration']) || payload?.Data?.Expiration || null,
    raw: payload
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
  const schema = parseSchema(
    raw.StreamableHTTPParameterSchema
    || raw.SSEParameterSchema
    || raw.EnvSchema
    || raw.ParameterSchema
  );
  return {
    ...normalized,
    readme: raw.Readme || raw.README || raw.Description || raw.Abstract || normalized.description,
    serviceFields: normalizeSchemaFields(schema),
    serviceSchema: schema,
    serverConfig: parseMaybeJson(raw.StreamableHTTPServerConfig || raw.SSEServerConfig || raw.ServerConfig),
    supportedTransportTypes: Array.isArray(raw.SupportedDeployTransportType) ? raw.SupportedDeployTransportType : [],
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

async function modelScopeFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  };
  let response;
  try {
    response = await fetch(`${MODELSCOPE_API_PREFIX}${path}`, {
      method: options.method || 'GET',
      credentials: 'include',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    });
  } catch (error) {
    throw new Error(`无法访问魔搭社区接口：${error?.message || '网络或 CORS 受限'}`);
  }
  const text = await response.text();
  const payload = parseApiPayload(text);
  if (!response.ok && !options.allowApiError) {
    throw new Error(payload?.Message || `魔搭接口返回 HTTP ${response.status}`);
  }
  if (payload?.Success === false && !options.allowApiError) {
    throw new Error(payload.Message || '魔搭接口返回失败。');
  }
  return payload;
}

function parseApiPayload(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const title = String(text || '').match(/<title>(.*?)<\/title>/i)?.[1];
    const waf = String(text || '').includes('aliyun_waf') || String(text || '').includes('acw_sc__v2');
    throw new Error(waf ? '魔搭接口受到登录或 WAF 保护，请先在魔搭社区完成登录。' : (title || '魔搭接口返回了非 JSON 内容。'));
  }
}

function parseSchema(value) {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return { type: 'object', properties: {}, required: [] };
}

function normalizeSchemaFields(schema = {}) {
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(properties).map(([key, value]) => {
    const meta = value && typeof value === 'object' ? value : {};
    const type = Array.isArray(meta.type) ? meta.type[0] : meta.type;
    return {
      key,
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
