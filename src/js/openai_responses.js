import { normalizeModelReasoningEffort } from './model_reasoning.js';
import { requestWithAttachments } from './attachment_inputs.js';
import { assertModelResponse } from './attachment_state.js';

// GPT-6 reasoning with tools requires Responses on the official OpenAI API.
// Gateway protocols remain owned by their configured Chat Completions endpoint.
export function needsOpenAIResponses(provider, effort, tools = []) {
  let hostname = '';
  try { hostname = new URL(provider.baseUrl).hostname; } catch { return false; }
  if (hostname !== 'api.openai.com' || !tools.length) return false;
  if (/^gpt-(?:6-astra|6\.1-sol)(?:$|[-_])/i.test(provider.model)) return true;
  return /^gpt-6-(?:sol|luna)(?:$|[-_])/i.test(provider.model) && normalizeModelReasoningEffort(provider, effort) !== 'none';
}

export async function requestOpenAIResponses({ provider, messages, tools, toolChoice, reasoningEffort, onDelta, signal, attachmentIssues = [], historicalAttachments = false }) {
  return requestWithAttachments(messages, provider, { issues: attachmentIssues, historical: historicalAttachments, protocol: 'responses' }, async (messages, prepared) => {
  let inputOffset = 0;
  const input = messages.flatMap((message, messageIndex) => {
    if (message.role === 'assistant' && message.responses_output?.length) { inputOffset += message.responses_output.length; return message.responses_output; }
    if (message.role === 'tool') { inputOffset++; return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content || '' }]; }
    prepared.files.filter(file => file.messageIndex === messageIndex).forEach(file => { file.inputIndex = inputOffset; });
    const items = [];
    if (message.content) {
      const content = Array.isArray(message.content) ? message.content.map(part => {
        if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url, detail: part.image_url.detail || 'auto' };
        if (part.type === 'file') return { type: 'input_file', filename: part.file.filename, file_data: part.file.file_data };
        return { type: message.role === 'assistant' ? 'output_text' : 'input_text', text: part.text || '' };
      }) : message.content;
      items.push({ role: message.role, content });
    }
    for (const call of message.tool_calls || []) {
      items.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    }
    inputOffset += items.length;
    return items;
  });
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/responses`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model, input,
      reasoning: { effort: normalizeModelReasoningEffort(provider, reasoningEffort) },
      tools: tools.map(tool => ({ type: 'function', ...tool.function, strict: false })),
      tool_choice: toolChoice, stream: true, store: false,
      include: ['reasoning.encrypted_content']
    })
  });
  if (!response.ok) {
    const body = await response.text(); const error = new Error(`API 请求失败 (${response.status}): ${body}`);
    error.status = response.status; error.body = body; throw error;
  }
  let result;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    result = await response.json();
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta') onDelta?.(event.delta || '');
        if (event.type === 'error' || event.type === 'response.failed') {
          const error = new Error(event.message || event.response?.error?.message || 'Responses API 请求失败');
          error.body = payload; error.status = Number(event.status || event.response?.error?.status) || 400; throw error;
        }
        if (event.type === 'response.completed' || event.type === 'response.incomplete') result = event.response;
      }
      if (done) break;
    }
  }
  assertModelResponse(result);
  if (!result || result.status === 'incomplete' || result.status === 'failed') {
    throw new Error(result?.error?.message || `Responses API 返回未完成：${result?.incomplete_details?.reason || '连接中断'}`);
  }
  const output = result.output || [];
  return {
    content: output.filter(item => item.type === 'message').flatMap(item => item.content || [])
      .map(part => part.text || part.refusal || '').join(''),
    toolCalls: output.filter(item => item.type === 'function_call').map(item => ({
      id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments }
    })),
    // Preserve original item order, encrypted reasoning and function calls.
    responses_output: output, attachments: []
  };
  });
}
