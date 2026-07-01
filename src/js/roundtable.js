import { appendMessage, replaceMessage, createId, now, getConversationMessages, normalizeGroupSettings } from './storage.js';
import { requestCharacterReply } from './chat_engine.js';
import { recordLongTermMemoryTurn } from './long_term_memory.js';
import { getAdvancedSettings } from './settings.js';

const PLAYER_ID = 'player';
const PLAYER_NAME = '分析员';
const DEFAULT_INTER_BOT_TURN_LIMIT = 3;
const MAX_QUEUE_SIZE = 24;
const MAX_EVENTS_PER_DRAIN = 12;

const roundtableState = {
  queue: [],
  activeSpeakerId: '',
  lastSpeakerId: '',
  processing: false,
  interBotDebt: 0,
  playerFloorLock: false
};

export async function sendGroupPlayerMessage({ store, conversation, text, attachments = [], onStore }) {
  roundtableState.playerFloorLock = false;
  if (!isPassivePlayerText(text)) roundtableState.interBotDebt = 0;
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
  const runtimeSettings = resolveRoundtableSettings(conversation);
  if (!triggerText && !runtimeSettings.idleTalk) return store;
  const participants = resolveParticipants(conversation, characters, runtimeSettings);
  if (!participants.length) return store;

  const mentioned = collectMentionedParticipants(triggerText, participants, { includeNameKeywords: true });
  const hasMentionTrigger = mentioned.length > 0;
  if (!runtimeSettings.autoBotChat && !hasMentionTrigger) return store;

  if (hasMentionTrigger) {
    mentioned.forEach((speaker, index) => enqueueRoundtableEvent({
      conversationId: conversation.id,
      speakerId: speaker.id,
      targetId: PLAYER_ID,
      targetName: PLAYER_NAME,
      triggerText,
      eventType: 'mention',
      priority: 120 - index
    }));
  } else {
    const history = getConversationMessages(store, conversation.id);
    const speaker = chooseSpeaker(participants, triggerText, history);
    enqueueRoundtableEvent({
      conversationId: conversation.id,
      speakerId: speaker.id,
      targetId: PLAYER_ID,
      targetName: PLAYER_NAME,
      triggerText,
      eventType: triggerText ? 'player' : 'idle',
      priority: triggerText ? 80 : 40
    });
  }

  return processRoundtableQueue({ store, conversationId: conversation.id, characters, onStore });
}

async function processRoundtableQueue({ store, conversationId, characters, onStore }) {
  if (roundtableState.processing) return store;
  roundtableState.processing = true;
  let nextStore = store;
  let processed = 0;
  try {
    while (processed < MAX_EVENTS_PER_DRAIN) {
      const event = dequeueRoundtableEvent(conversationId);
      if (!event) break;
      const conversation = getGroupConversation(nextStore, event.conversationId);
      if (!conversation) continue;
      const settings = resolveRoundtableSettings(conversation);
      const participants = resolveParticipants(conversation, characters, settings);
      const speaker = participants.find(item => item.id === event.speakerId);
      if (!speaker) continue;
      if (isInterBotEvent(event) && roundtableState.interBotDebt >= settings.botChainLimit) {
        roundtableState.playerFloorLock = true;
        break;
      }

      const target = resolveEventTarget(event, participants, speaker);
      roundtableState.activeSpeakerId = speaker.id;
      const result = await runSpeakerReply({
        store: nextStore,
        conversation,
        speaker,
        participants,
        target,
        triggerText: event.triggerText,
        eventType: event.eventType,
        interBotDebt: roundtableState.interBotDebt,
        botChainLimit: settings.botChainLimit,
        onStore
      });
      nextStore = result.store;
      roundtableState.lastSpeakerId = speaker.id;
      if (isInterBotEvent(event)) {
        roundtableState.interBotDebt = Math.min(settings.botChainLimit, roundtableState.interBotDebt + 1);
      } else {
        roundtableState.interBotDebt = 0;
      }
      onStore?.(nextStore);
      handlePostBotEvent({
        conversation,
        participants,
        speaker,
        settings,
        event,
        payload: result.payload,
        text: result.text
      });
      processed += 1;
    }
    return nextStore;
  } finally {
    roundtableState.processing = false;
    roundtableState.activeSpeakerId = '';
  }
}

async function runSpeakerReply({
  store,
  conversation,
  speaker,
  participants,
  target,
  triggerText,
  eventType,
  interBotDebt,
  botChainLimit,
  onStore
}) {
  const typingId = createId('typing');
  let nextStore = appendMessage(store, conversation.id, {
    id: typingId,
    role: 'assistant',
    speakerId: speaker.id,
    speakerName: speaker.name,
    text: '',
    createdAt: now(),
    status: 'typing'
  });
  onStore?.(nextStore);

  let payload;
  let finalText;
  let status = 'sent';
  try {
    const rawReply = await requestCharacterReply({
      store: nextStore,
      conversation,
      character: speaker,
      userText: buildRoundtablePrompt({
        triggerText,
        speaker,
        participants,
        target,
        eventType,
        interBotDebt,
        botChainLimit
      }),
      mode: 'roundtable',
      event: {
        expectsJson: true,
        targetName: target.name,
        targetId: target.id,
        eventType,
        interBotDebt,
        botChainLimit
      }
    });
    payload = normalizeBotPayload(rawReply, target, participants, speaker);
    finalText = ensureTargetPrefix(payload.text, payload.target);
  } catch (err) {
    payload = { target, wantsFollowUp: false, suggestedFollowUpTargetId: '', topicHint: '' };
    finalText = ensureTargetPrefix(`模型请求失败：${err?.message || '未知错误'}`, target);
    status = 'error';
  }

  nextStore = replaceMessage(nextStore, conversation.id, typingId, {
    role: 'assistant',
    speakerId: speaker.id,
    speakerName: speaker.name,
    text: finalText,
    createdAt: now(),
    status,
    meta: {
      eventType,
      targetId: payload.target.id,
      intent: payload.intent,
      emotion: payload.emotion,
      wantsFollowUp: payload.wantsFollowUp,
      suggestedFollowUpTargetId: payload.suggestedFollowUpTargetId
    }
  });
  if (status === 'sent') {
    recordLongTermMemoryTurn({
      source: 'roundtable',
      publicScope: true,
      characterId: speaker.id,
      characterName: speaker.name,
      assistantText: finalText,
      userText: eventType === 'player' || eventType === 'mention' ? triggerText : '',
      sourceMessageIds: [typingId],
      speakerId: speaker.id,
      speakerName: speaker.name,
      addresseeId: payload.target.id,
      addresseeName: payload.target.name
    });
  }
  return { store: nextStore, text: finalText, payload: { ...payload, text: finalText } };
}

function handlePostBotEvent({ conversation, participants, speaker, settings, event, payload, text }) {
  if (!settings.autoBotChat) return;
  if (roundtableState.interBotDebt >= settings.botChainLimit) {
    roundtableState.playerFloorLock = true;
    return;
  }
  if (roundtableState.interBotDebt >= settings.botChainLimit - 1) {
    roundtableState.playerFloorLock = true;
    return;
  }

  const suggested = resolveSuggestedFollowUp(payload, participants, speaker);
  const mentioned = collectBotMentionCandidates(text, participants, speaker, settings);
  const mentionedCandidate = mentioned.find(item => item.id !== speaker.id);
  let nextSpeaker = suggested || mentionedCandidate || null;
  let reason = nextSpeaker ? 'mentionFollowUp' : '';

  if (!nextSpeaker && payload.wantsFollowUp) {
    const rate = clampNumber(getAdvancedSettings().roundtableFollowUpRate, 0, 1, 0.55);
    if (Math.random() <= rate) {
      nextSpeaker = chooseFollowUpSpeaker(participants, speaker, event);
      reason = 'followup';
    }
  }
  if (!nextSpeaker) return;

  enqueueRoundtableEvent({
    conversationId: conversation.id,
    speakerId: nextSpeaker.id,
    targetId: speaker.id,
    targetName: speaker.name,
    triggerText: text,
    eventType: reason || 'followup',
    priority: reason === 'mentionFollowUp' ? 90 : 55
  });
}

function resolveRoundtableSettings(conversation) {
  const group = normalizeGroupSettings(conversation.groupSettings);
  return {
    ...group,
    maxParticipants: Math.max(2, Math.min(group.maxParticipants, 20)),
    botChainLimit: Math.max(1, Math.min(group.botChainLimit || DEFAULT_INTER_BOT_TURN_LIMIT, 6))
  };
}

function resolveParticipants(conversation, characters, settings) {
  return conversation.memberIds
    .map(id => characters.find(item => item.id === id))
    .filter(Boolean)
    .slice(0, settings.maxParticipants);
}

function chooseSpeaker(participants, triggerText, history) {
  const mentioned = collectMentionedParticipants(triggerText, participants, { includeNameKeywords: true });
  if (mentioned.length) return mentioned.find(item => item.id !== roundtableState.lastSpeakerId) || mentioned[0];
  const lastMessage = history.slice().reverse().find(item => item.role === 'assistant');
  const questionBonus = /[?？吗呢]|\bwhy\b|\bhow\b/i.test(triggerText) ? 3 : 0;
  const candidates = participants
    .map(item => ({
      item,
      score: Math.random() * 8
        + questionBonus
        + (item.id === roundtableState.lastSpeakerId ? -12 : 0)
        + (item.id === lastMessage?.speakerId ? -5 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.item || participants[0];
}

function collectMentionedParticipants(text, participants, options = {}) {
  const source = normalizeAtText(text);
  if (hasAllMention(source)) return participants;
  return participants.filter(item => {
    const name = item.name || '';
    if (!name) return false;
    const explicit = new RegExp(`@\\s*${escapeRegExp(name)}(?=$|[\\s,，。！？!?、:：])`).test(source);
    if (explicit) return true;
    return options.includeNameKeywords !== false && [...name].length >= 2 && source.includes(name);
  });
}

function collectBotMentionCandidates(text, participants, speaker, settings) {
  const source = settings.botAtMentionTriggersReply ? text : removeLeadingAtToken(text);
  return collectMentionedParticipants(source, participants, { includeNameKeywords: true })
    .filter(item => item.id !== speaker?.id);
}

function resolveEventTarget(event, participants, speaker) {
  if (event.targetId === PLAYER_ID) return { id: PLAYER_ID, name: PLAYER_NAME };
  const target = participants.find(item => item.id === event.targetId)
    || participants.find(item => item.name === event.targetName);
  if (!target || target.id === speaker?.id) return { id: PLAYER_ID, name: PLAYER_NAME };
  return { id: target.id, name: target.name };
}

function resolveSuggestedFollowUp(payload, participants, speaker) {
  if (!payload.wantsFollowUp && !payload.suggestedFollowUpTargetId) return null;
  const id = payload.suggestedFollowUpTargetId;
  if (!id || id === PLAYER_ID || id === speaker.id) return null;
  return participants.find(item => item.id === id || item.name === id) || null;
}

function buildRoundtablePrompt({ triggerText, speaker, participants, target, eventType, interBotDebt, botChainLimit }) {
  const roster = participants.map(item => `${item.name}(${item.id})`).join('、');
  const nearLimit = interBotDebt >= botChainLimit - 1;
  return [
    `群聊成员：${roster}`,
    `当前发言者：${speaker.name}(${speaker.id})`,
    `回复对象：${target?.name || PLAYER_NAME}(${target?.id || PLAYER_ID})`,
    `事件类型：${isInterBotEvent({ eventType }) ? 'bot-to-bot followup' : 'player message'}`,
    `当前机器人互聊进度：${interBotDebt}/${botChainLimit}`,
    triggerText ? `触发消息：${triggerText}` : '请自然延续圆桌密语话题。',
    `如果玩家正在 @${speaker.name}，请直接回复玩家 ${PLAYER_NAME}，不要在开头 @ 自己。`,
    nearLimit
      ? `这是 bot-to-bot 上限前的最后阶段，请把话题交还给 ${PLAYER_NAME}，wantsFollowUp 必须为 false。`
      : '如果确实需要另一位机器人接话，可设置 wantsFollowUp 为 true，并填写 suggestedFollowUpTargetId。',
    '只输出一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。',
    `JSON 字段：{"text":"@${target?.name || PLAYER_NAME} 一句即时通讯式回复","targetId":"${target?.id || PLAYER_ID}","intent":"chat|answer|handoff","emotion":"neutral","wantsFollowUp":false,"suggestedFollowUpTargetId":"","topicHint":""}`,
    `text 必须以 @${target?.name || PLAYER_NAME} 开头。suggestedFollowUpTargetId 只能填写群成员 id，不能填写当前发言者自己。`
  ].join('\n');
}

function normalizeBotPayload(rawReply, fallbackTarget, participants, speaker) {
  const parsed = parseJsonObject(rawReply);
  const target = resolvePayloadTarget(parsed, fallbackTarget, participants, speaker);
  const text = String(parsed?.text || parsed?.message || rawReply || '').trim();
  return {
    target,
    text: text || `@${target.name} 嗯，我在听。`,
    intent: String(parsed?.intent || 'chat').slice(0, 40),
    emotion: String(parsed?.emotion || 'neutral').slice(0, 40),
    wantsFollowUp: parsed?.wantsFollowUp === true || parsed?.wants_follow_up === true,
    suggestedFollowUpTargetId: String(parsed?.suggestedFollowUpTargetId || parsed?.suggested_follow_up_target_id || '').trim().slice(0, 120),
    topicHint: String(parsed?.topicHint || parsed?.topic_hint || '').trim().slice(0, 160)
  };
}

function resolvePayloadTarget(parsed, fallbackTarget, participants, speaker) {
  const rawId = String(parsed?.targetId || parsed?.target_id || '').trim();
  const rawName = String(parsed?.targetName || parsed?.target_name || '').trim();
  if (rawId === PLAYER_ID || rawName === PLAYER_NAME) return { id: PLAYER_ID, name: PLAYER_NAME };
  const target = participants.find(item => item.id === rawId || item.name === rawName);
  if (!target || target.id === speaker?.id) return fallbackTarget?.id === speaker?.id ? { id: PLAYER_ID, name: PLAYER_NAME } : fallbackTarget;
  return { id: target.id, name: target.name };
}

function chooseFollowUpSpeaker(participants, speaker, event) {
  const candidates = participants
    .filter(item => item.id !== speaker.id)
    .map(item => ({
      item,
      score: Math.random()
        + (item.id === event.targetId ? -0.35 : 0)
        + (item.id === roundtableState.lastSpeakerId ? -0.25 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.item || null;
}

function enqueueRoundtableEvent(event) {
  roundtableState.queue.push({
    id: createId('rt_event'),
    createdAt: now(),
    priority: 0,
    ...event
  });
  roundtableState.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  if (roundtableState.queue.length > MAX_QUEUE_SIZE) {
    roundtableState.queue.splice(MAX_QUEUE_SIZE);
  }
}

function dequeueRoundtableEvent(conversationId) {
  const index = roundtableState.queue.findIndex(event => event.conversationId === conversationId);
  if (index < 0) return null;
  return roundtableState.queue.splice(index, 1)[0];
}

function getGroupConversation(store, conversationId) {
  const conversation = store.conversations.find(item => item.id === conversationId);
  return conversation?.type === 'group' ? conversation : null;
}

function isInterBotEvent(event) {
  return ['followup', 'mentionFollowUp', 'interBotChain'].includes(event?.eventType);
}

function hasAllMention(text) {
  return /@(?:全体|所有人|大家|各位|all)(?=$|[\s,，。！？!?、:：])|大家|各位|所有人|每个人|都说说|一起说/.test(text);
}

function normalizeAtText(text) {
  return String(text || '').replace(/＠/g, '@').trim();
}

function removeLeadingAtToken(text) {
  return normalizeAtText(text).replace(/^@\s*[^\s，。！？、：:]+[\s，。！？、：:]*/, '').trim();
}

function ensureTargetPrefix(reply, target) {
  const text = String(reply || '').trim();
  const targetName = target?.name || PLAYER_NAME;
  if (!text || !targetName) return text;
  if (text.startsWith(`@${targetName}`) || text.startsWith(`＠${targetName}`)) return text;
  return `@${targetName} ${stripLeadingTargetPrefix(text)}`.trim();
}

function stripLeadingTargetPrefix(text) {
  return normalizeAtText(text).replace(/^@\s*[^\s，。！？、：:]+[\s，。！？、：:]*/, '').trim();
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isPassivePlayerText(text = '') {
  return /^(嗯|恩|好|好的|继续|然后呢|你们说|你们继续|接着说|说吧|啊|诶)[。.!！?？~]*$/i.test(String(text || '').trim());
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
