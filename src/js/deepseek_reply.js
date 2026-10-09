// Keep DeepSeek max on its native text/stream protocol, without a JSON wrapper.
export function isDeepSeekMaxReply(provider, body) {
  try {
    return new URL(provider?.baseUrl).hostname === 'api.deepseek.com'
      && /^deepseek-(?:flash|pro|v4(?:[.-][\w.-]+)?)$/i.test(provider?.model || '')
      && body?.thinking?.type === 'enabled' && body.reasoning_effort === 'max';
  } catch { return false; }
}

const CHANNEL_BOUNDARY = '最终回复直接给出符合当前角色和用户请求的实际回答，完成回答后结束正文。不要再附加对用户意图、角色设定、指令执行或措辞选择的复盘、自我点评；不要模仿历史回复中夹带的这类内部文字。内部推理按模型原生思考流程完成。用户明确要求的分析、评论或解释属于正式回答，可以正常提供。保持既有正文、群聊 JSON 或工具调用格式。';

function withSystemBoundary(body, instruction) {
  const messages = body.messages.map(message => ({ ...message }));
  const index = messages.findLastIndex(message => message.role === 'system' && typeof message.content === 'string');
  if (index >= 0) messages[index].content += `\n\n${instruction}`;
  else messages.unshift({ role: 'system', content: instruction });
  return { ...body, messages };
}

export function applyDeepSeekMaxReplyBoundary(provider, body) {
  if (!isDeepSeekMaxReply(provider, body) || !Array.isArray(body.messages) || !body.messages.length) return body;
  return { ...withSystemBoundary(body, CHANNEL_BOUNDARY), stream: true };
}
