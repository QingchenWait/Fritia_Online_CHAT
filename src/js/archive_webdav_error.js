// A readable directory does not imply permission/quota for PUT. Use only the
// server's explicit reason to classify quota; generic HTTP 403 is ambiguous.
export async function webDavWriteError(response, config, { label, file, size }) {
  let raw = '';
  try { raw = await response.text(); } catch { /* Some native/CORS errors have no body. */ }
  const reason = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const quota = /(?:上传|upload|traffic|bandwidth|transfer)/i.test(reason)
    && /(?:流量.{0,24}(?:用尽|耗尽|不足|超|上限|限额)|(?:超|达到).{0,16}(?:流量|配额)|(?:quota|limit).{0,32}(?:exceed|reach)|(?:exceed|reach).{0,32}(?:quota|limit)|insufficient.{0,20}(?:traffic|bandwidth)|traffic\s+quota\s+(?:exceeded|exhausted))/i.test(reason);
  const storage = /(?:空间|storage|disk)/i.test(reason) && /(?:不足|用尽|已满|超出|full|insufficient|exceed|quota)/i.test(reason);
  let provider = 'WebDAV';
  try { if (/(^|\.)jianguoyun\.com$/i.test(new URL(config.url).hostname)) provider = '坚果云'; } catch { /* Generic server. */ }
  let hint = '';
  if (quota) hint = `${provider}返回上传流量额度已用尽或超限，请等待额度重置，或在服务端补充额度后重试。`;
  else if (storage) hint = `${provider}返回存储空间不足，请在服务端检查剩余空间后重试。`;
  else if (response.status === 403) hint = `${provider}拒绝上传；连接测试只验证目录访问。请检查剩余上传流量、存储空间和同步目录写入权限；服务器未明确说明流量已用尽。`;
  else if (response.status === 429) hint = `${provider}请求过于频繁，请稍后重试。`;
  else if (response.status === 413) hint = `${provider}拒绝此文件大小，请检查服务端单文件上传限制。`;
  // Show text via the existing textContent UI, never HTML or credentials.
  let safeReason = reason.replace(/https?:\/\/\S+/gi, '[服务器地址]');
  if (config.password) safeReason = safeReason.split(config.password).join('[已隐藏]');
  safeReason = safeReason.slice(0, 700);
  return new Error([`${label}：${response.status}。原有版本未改变，本地数据已保留。`, hint,
    `文件：${file}（${size} 字节）`, safeReason ? `服务器说明：${safeReason}` : '服务器未提供错误说明。'].filter(Boolean).join('\n'));
}
