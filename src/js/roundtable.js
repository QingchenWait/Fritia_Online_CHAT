import { appendMessage, replaceMessage, createId, now, getConversationMessages } from './storage.js';
import { getAdvancedSettings } from './settings.js';
import { requestCharacterReply } from './chat_engine.js';
import { recordLongTermMemoryTurn } from './long_term_memory.js';

const PLAYER_ID = 'player';
const PLAYER_NAME = '分析员';

const roundtableState = {
  activeSpeakerId: '',
  lastSpeakerId: '',
  processing: false,
  queue: []
};

export async function sendGroupPlayerMessage({ store, conversation, text, attachments = [], onStore }) {
  const message = {
    id: createId('msg'),
    role: 'user',
    speakerId: PLAYER_ID,
    speakerName: PLAYER_NAME,
    text,
    attachments,
    createdAt: now()
  };
  const nextStore = appendMessage(store, conversation.id, message);
  onStore?.(nextStore);
  return { store: nextStore, message };
}

export async function runRoundtableTurn({ store, conversation, characters, triggerText = '', onStore }) {
  if (!conversation || conversation.type !== 'group') return store;
  if (roundtableState.processing) return store;
  roundtableState.processing = true;
  let nextStore = store;
  try {
    const participants = conversation.memberIds
      .map(id => characters.find(item => item.id === id))
      .filter(Boolean)
      .slice(0, getAdvancedSettings().roundtableMaxParticipants);
    if (!participants.length) return nextStore;
    const speaker = chooseSpeaker(participants, triggerText, getConversationMessages(store, conversation.id));
    if (!speaker) return nextStore;
    const typingId = createId('typing');
    nextStore = appendMessage(nextStore, conversation.id, {
      id: typingId,
      role: 'assistant',
      speakerId: speaker.id,
      speakerName: speaker.name,
      text: '',
      createdAt: now(),
      status: 'typing'
    });
    onStore?.(nextStore);
    const reply = await requestCharacterReply({
      store: nextStore,
      conversation,
      character: speaker,
      userText: buildRoundtablePrompt(triggerText, speaker, participants),
      mode: 'roundtable',
      event: { targetName: resolveTargetName(triggerText, participants) || PLAYER_NAME }
    });
    nextStore = replaceMessage(nextStore, conversation.id, typingId, {
      role: 'assistant',
      speakerId: speaker.id,
      speakerName: speaker.name,
      text: ensureTargetPrefix(reply, triggerText, participants),
      createdAt: now(),
      status: 'sent'
    });
    recordLongTermMemoryTurn({
      source: 'roundtable',
      publicScope: true,
      characterId: speaker.id,
      characterName: speaker.name,
      assistantText: reply,
      userText: triggerText,
      sourceMessageIds: [typingId],
      speakerId: speaker.id,
      speakerName: speaker.name
    });
    roundtableState.lastSpeakerId = speaker.id;
    onStore?.(nextStore);
    return nextStore;
  } finally {
    roundtableState.processing = false;
  }
}

function chooseSpeaker(participants, triggerText, history) {
  const mentioned = collectMentionedParticipants(triggerText, participants);
  if (mentioned.length) return mentioned.find(item => item.id !== roundtableState.lastSpeakerId) || mentioned[0];
  const lastMessage = history.slice().reverse().find(item => item.role === 'assistant');
  const candidates = participants
    .map(item => ({
      item,
      score: Math.random() * 8
        + (item.id === roundtableState.lastSpeakerId ? -12 : 0)
        + (item.id === lastMessage?.speakerId ? -5 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.item || participants[0];
}

function collectMentionedParticipants(text, participants) {
  const source = String(text || '');
  if (/[@＠]\s*(全体|所有人|大家|各位)|大家|每个人|都说说/.test(source)) return participants;
  return participants.filter(item => {
    const name = item.name || '';
    return source.includes(`@${name}`) || source.includes(`＠${name}`) || (name.length >= 2 && source.includes(name));
  });
}

function resolveTargetName(text, participants) {
  const mentioned = collectMentionedParticipants(text, participants);
  return mentioned[0]?.name || '';
}

function buildRoundtablePrompt(triggerText, speaker, participants) {
  const roster = participants.map(item => item.name).join('、');
  return [
    `群聊成员：${roster}`,
    `现在轮到 ${speaker.name} 发言。`,
    triggerText ? `触发消息：${triggerText}` : '请自然延续圆桌密语话题。',
    '请输出一句即时通讯式群聊回复。'
  ].join('\n');
}

function ensureTargetPrefix(reply, triggerText, participants) {
  const target = resolveTargetName(triggerText, participants);
  if (!target) return reply;
  if (String(reply).trim().startsWith(`@${target}`) || String(reply).trim().startsWith(`＠${target}`)) return reply;
  return `@${target} ${reply}`;
}
