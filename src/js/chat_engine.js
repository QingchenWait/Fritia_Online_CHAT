import { appendMessage, replaceMessage, createId, now, getConversationMessages } from './storage.js';
import { getSettings, getAdvancedSettings } from './settings.js';
import { buildRagReferenceMessage } from './knowledge_base.js';
import { buildLongTermMemoryMessage, recordLongTermMemoryTurn } from './long_term_memory.js';
import { characterDisplayName } from './characters.js';
import { buildDeepSeekIntimateUserMessage, shouldKeepMessageForCurrentDeepSeekMode } from './deepseek_intimate_mode.js';
import { attachmentLabelText, buildModelMessageContent } from './llm_media.js';
import { saveDataUrlAsMedia } from './media_store.js';
import { getTtsErrorLog, synthesizeMimoVoiceClone } from './tts_engine.js';

const PLAYER_ID = 'player';
const PLAYER_NAME = '分析员';

export async function sendPrivateMessage({
  store,
  conversation,
  character,
  text,
  attachments = [],
  voiceReplyEnabled = false,
  onVoiceNotice,
  onStore
}) {
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

  return completePrivateMessageReply({
    store: nextStore,
    conversation,
    character,
    text,
    userMessage,
    voiceReplyEnabled,
    onVoiceNotice,
    onStore
  });
}

export async function completePrivateMessageReply({
  store,
  conversation,
  character,
  text,
  userMessage = null,
  voiceReplyEnabled = false,
  onVoiceNotice,
  onStore
}) {
  if (!store || !conversation || !character) return null;
  const typingId = createId('typing');
  let nextStore = appendMessage(store, conversation.id, {
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
    const result = await requestCharacterReply({
      store: nextStore,
      conversation,
      character,
      userText: text,
      userMessage
    });
    const reply = typeof result === 'string' ? result : result.text;
    const baseMeta = {
      deepseekIntimateMode: typeof result === 'object' && result?.deepseekIntimateMode === true
    };
    if (voiceReplyEnabled) {
      try {
        const voiceAttachment = await buildVoiceReplyAttachment(reply, character);
        nextStore = replaceMessage(nextStore, conversation.id, typingId, {
          text: reply,
          attachments: [voiceAttachment],
          status: 'sent',
          createdAt: now(),
          meta: {
            ...baseMeta,
            voiceReply: true,
            ttsText: reply
          }
        });
      } catch (ttsError) {
        const message = `语音生成失败：${ttsError?.message || '未知错误'}`;
        onVoiceNotice?.({
          conversationId: conversation.id,
          level: 'error',
          text: message,
          title: '语音生成异常',
          detail: getTtsErrorLog(ttsError)
        });
        nextStore = replaceMessage(nextStore, conversation.id, typingId, {
          text: reply,
          status: 'sent',
          createdAt: now(),
          meta: {
            ...baseMeta,
            voiceReplyFailed: true,
            ttsError: message
          }
        });
      }
    } else {
      nextStore = replaceMessage(nextStore, conversation.id, typingId, {
        text: reply,
        status: 'sent',
        createdAt: now(),
        meta: baseMeta
      });
    }
    recordLongTermMemoryTurn({
      source: 'private',
      characterId: character.id,
      characterName: character.name,
      userText: text,
      assistantText: reply,
      sourceMessageIds: [userMessage?.id, typingId].filter(Boolean),
      deepseekIntimateMode: typeof result === 'object' && result?.deepseekIntimateMode === true
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

export async function requestCharacterReply({ store, conversation, character, userText, mode = 'private', event = null, userMessage = null }) {
  const settings = getSettings();
  if (!settings.apiKey) {
    return localFallbackReply(character, userText, mode);
  }
  const history = getConversationMessages(store, conversation.id)
    .filter(item => item.status !== 'typing')
    .filter(item => shouldKeepMessageForCurrentDeepSeekMode(item, settings));
  const advanced = getAdvancedSettings();
  const intimateMessage = await buildDeepSeekIntimateUserMessage(settings);
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
  const messages = await buildMessages({
    character,
    history,
    userText,
    userMessage,
    ragMessage,
    memoryMessage,
    intimateMessage,
    historyLimit: advanced.historyLimit,
    mode,
    event
  });
  const responseText = await requestOpenAICompatible(settings, messages);
  return {
    text: sanitizeReply(responseText, character.name),
    deepseekIntimateMode: Boolean(intimateMessage)
  };
}

async function buildMessages({ character, history, userText, userMessage, ragMessage, memoryMessage, intimateMessage, historyLimit, mode, event }) {
  const system = [
    `你正在一个 QQ / Telegram 风格的角色扮演聊天软件中发言。`,
    `本次你只扮演：${character.name}。不要代替用户或其他角色发言。`,
    mode === 'roundtable'
      ? '这是群聊“圆桌密语”。仍然只输出你自己的消息。'
      : '这是私聊。请像即时通讯好友一样自然回复。',
    mode === 'roundtable' && event?.expectsJson
      ? '本轮圆桌调度要求只输出一个 JSON 对象，不要 Markdown、代码块或额外解释；JSON 中的 text 字段才是实际聊天内容。'
      : '',
    `你的完整人格设定如下：\n${character.prompt || `你正在扮演 ${character.name}。`}`,
    character.examples ? `示例对话：\n${character.examples}` : '',
    event?.targetName ? `本轮主要回应对象：${event.targetName}` : '',
    event?.botChainLimit ? `互聊进度：${event.interBotDebt || 0}/${event.botChainLimit}` : ''
  ].filter(Boolean).join('\n\n');
  const currentMessageId = userMessage?.id || '';
  const recent = await Promise.all(history
    .filter(item => !currentMessageId || item.id !== currentMessageId)
    .slice(-historyLimit)
    .map(async item => ({
      role: item.role === 'assistant' ? 'assistant' : item.role === 'system' ? 'system' : 'user',
      content: await buildModelMessageContent({
        speakerName: item.speakerName || (item.role === 'user' ? PLAYER_NAME : character.name),
        text: item.text || '',
        attachments: item.meta?.voiceReply === true ? [] : (item.attachments || [])
      })
    })));
  const currentUserContent = await buildModelMessageContent({
    speakerName: PLAYER_NAME,
    text: userText,
    attachments: userMessage?.attachments || []
  });
  return [
    { role: 'system', content: system },
    ...(ragMessage ? [ragMessage] : []),
    ...(memoryMessage ? [memoryMessage] : []),
    ...(intimateMessage ? [intimateMessage] : []),
    ...recent,
    { role: 'user', content: currentUserContent }
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

async function buildVoiceReplyAttachment(text, character) {
  if (!character?.voiceSample) {
    throw new Error(`${character?.name || '当前角色'}没有配置 TTS 参考语音。`);
  }
  const audio = await synthesizeMimoVoiceClone({
    text,
    voiceSample: character.voiceSample
  });
  const duration = await readAudioDuration(audio.dataUrl);
  const media = await saveDataUrlAsMedia(audio.dataUrl, {
    prefix: 'tts',
    category: 'tts-reply',
    name: `${character.name || 'voice'}-${Date.now()}.${audioExtension(audio.mime)}`,
    mime: audio.mime || 'audio/wav',
    size: audio.size || 0
  });
  return {
    id: createId('att'),
    type: 'audio',
    name: media.name || `${character.name || 'voice'}-reply.${audioExtension(audio.mime)}`,
    mime: media.mime || audio.mime || 'audio/wav',
    size: media.size || audio.size || 0,
    dataRef: media.ref,
    source: 'tts-reply',
    duration
  };
}

function readAudioDuration(dataUrl) {
  return new Promise(resolve => {
    const audio = new Audio();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      audio.removeAttribute('src');
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    const timer = setTimeout(() => finish(0), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      finish(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      finish(0);
    };
    audio.src = dataUrl;
  });
}

function audioExtension(mime = '') {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  return 'wav';
}

function attachmentText(attachments = []) {
  return attachmentLabelText(attachments);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
