import { appendMessage, replaceMessage, createId, now, getConversationMessages } from './storage.js';
import { getSettings, getAdvancedSettings } from './settings.js';
import { buildRagReferenceMessage } from './knowledge_base.js';
import { buildLongTermMemoryMessage, recordLongTermMemoryTurn } from './long_term_memory.js';
import { characterDisplayName } from './characters.js';

const PLAYER_ID = 'player';
const PLAYER_NAME = '分析员';

export async function sendPrivateMessage({ store, conversation, character, text, attachments = [], onStore }) {
  if (!conversation || !character) return null;
  const userMessage = {
    id: createId('msg'),
    role: 'user',
    speakerId: PLAYER_ID,
    speakerName: PLAYER_NAME,
    text,
    attachments,
    createdAt: now()
  };
  let nextStore = appendMessage(store, conversation.id, userMessage);
  onStore?.(nextStore);

  const typingId = createId('typing');
  nextStore = appendMessage(nextStore, conversation.id, {
    id: typingId,
    role: 'assistant',
    speakerId: character.id,
    speakerName: character.name,
    text: '',
    createdAt: now(),
    status: 'typing'
  });
  onStore?.(nextStore);

  try {
    const reply = await requestCharacterReply({
      store: nextStore,
      conversation,
      character,
      userText: text
    });
    nextStore = replaceMessage(nextStore, conversation.id, typingId, {
      text: reply,
      status: 'sent',
      createdAt: now()
    });
    recordLongTermMemoryTurn({
      source: 'private',
      characterId: character.id,
      characterName: character.name,
      userText: text,
      assistantText: reply,
      sourceMessageIds: [userMessage.id, typingId]
    });
    onStore?.(nextStore);
    return reply;
  } catch (err) {
    const fallback = friendlyError(err);
    nextStore = replaceMessage(nextStore, conversation.id, typingId, {
      text: fallback,
      status: 'error',
      createdAt: now()
    });
    onStore?.(nextStore);
    return fallback;
  }
}

export async function requestCharacterReply({ store, conversation, character, userText, mode = 'private', event = null }) {
  const settings = getSettings();
  if (!settings.apiKey) {
    return localFallbackReply(character, userText, mode);
  }
  const history = getConversationMessages(store, conversation.id).filter(item => item.status !== 'typing');
  const advanced = getAdvancedSettings();
  const ragMessage = await buildRagReferenceMessage({
    mode,
    query: userText,
    userText,
    history
  });
  const memoryMessage = await buildLongTermMemoryMessage({
    mode,
    characterId: character.id,
    characterName: character.name,
    query: userText,
    userText,
    history
  });
  const messages = buildMessages({
    character,
    history,
    userText,
    ragMessage,
    memoryMessage,
    historyLimit: advanced.historyLimit,
    mode,
    event
  });
  const responseText = await requestOpenAICompatible(settings, messages);
  return sanitizeReply(responseText, character.name);
}

function buildMessages({ character, history, userText, ragMessage, memoryMessage, historyLimit, mode, event }) {
  const system = [
    `你正在一个 QQ / Telegram 风格的角色扮演聊天软件中发言。`,
    `本次你只扮演：${character.name}。不要代替用户或其他角色发言。`,
    mode === 'roundtable'
      ? '这是群聊“圆桌密语”。如果要回应某人，可用 @名字 开头；仍然只输出你自己的消息。'
      : '这是私聊。请像即时通讯好友一样自然回复。',
    `你的完整人格设定如下：\n${character.prompt || `你正在扮演 ${character.name}。`}`,
    character.examples ? `示例对话：\n${character.examples}` : '',
    event?.targetName ? `本轮主要回应对象：${event.targetName}` : ''
  ].filter(Boolean).join('\n\n');
  const recent = history.slice(-historyLimit).map(item => ({
    role: item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user',
    content: `${item.speakerName || (item.role === 'user' ? PLAYER_NAME : character.name)}：${item.text || attachmentText(item.attachments)}`
  }));
  return [
    { role: 'system', content: system },
    ...(ragMessage ? [ragMessage] : []),
    ...(memoryMessage ? [memoryMessage] : []),
    ...recent,
    { role: 'user', content: `${PLAYER_NAME}：${userText}` }
  ];
}

async function requestOpenAICompatible(settings, messages) {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      stream: false
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`模型请求失败：${response.status} ${body.slice(0, 240)}`);
  }
  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('模型返回为空');
  return text;
}

function sanitizeReply(text = '', speakerName = '') {
  let result = String(text || '').trim();
  result = result.replace(/^```(?:json|text)?/i, '').replace(/```$/i, '').trim();
  if (speakerName) {
    const re = new RegExp(`^\\s*(?:${escapeRegExp(speakerName)}|我)\\s*[:：]\\s*`);
    result = result.replace(re, '').trim();
  }
  return result || '嗯……我在听';
}

function localFallbackReply(character, userText, mode) {
  const name = characterDisplayName(character);
  if (mode === 'roundtable') {
    return `@分析员 ${name}已经收到消息啦。配置模型后，我就能按完整人格设定继续接话。`;
  }
  if (/图片|图/.test(userText)) return `我看到你发来的内容了。配置模型后，我可以更认真地陪你聊这张图~`;
  return `${name}已经在这里了。现在还没有配置模型连接，所以先用本地占位回复陪你一下~`;
}

function friendlyError(err) {
  console.warn('[chat] request failed', err);
  return `模型请求失败：${err?.message || '未知错误'}\n请在设置里检查 API Key、Base URL 和模型名称。`;
}

function attachmentText(attachments = []) {
  if (!attachments.length) return '';
  return attachments.map(item => `[${item.type === 'image' ? '图片' : '附件'}:${item.name || item.mime || '未命名'}]`).join(' ');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
