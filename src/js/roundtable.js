import { appendMessage, replaceMessage, createId, now, getConversationMessages, normalizeGroupSettings } from './storage.js';
import { buildRagReferenceMessage } from './knowledge_base.js';
import { buildLongTermMemoryMessage, recordLongTermMemoryTurn } from './long_term_memory.js';
import { getSettings, getAdvancedSettings } from './settings.js';
import { buildDeepSeekIntimateUserMessage, shouldKeepMessageForCurrentDeepSeekMode } from './deepseek_intimate_mode.js';

const PLAYER_ID = 'player';
const PLAYER_NAME = '分析员';
const ALL_ID = 'all';
const HANDOFF_INTENT = 'handoff_to_player';
const DEFAULT_INTER_BOT_TURN_LIMIT = 3;
const MIN_INTER_BOT_TURN_LIMIT = 1;
const MAX_INTER_BOT_TURN_LIMIT = 6;
const MIN_HANDOFF_CHAIN_RATIO = 0.6;
const CALL_WINDOW_MS = 3 * 60 * 1000;
const SOFT_CALL_LIMIT_10M = 15;
const IDLE_CALL_LIMIT_10M = 3;
const TOKEN_SOFT_LIMIT_10M = 300000;
const MAX_QUEUE_SIZE = 24;
const MAX_EVENTS_PER_DRAIN = 12;

const ALLOWED_INTENTS = new Set(['answer', 'react', 'tease', 'ask', 'shift_topic', 'idle', HANDOFF_INTENT]);
const ALLOWED_EMOTIONS = new Set(['neutral', 'happy', 'shy', 'jealous', 'teasing', 'serious']);
const LOW_PRIORITY_TYPES = new Set(['followup', 'idle']);

const BUILTIN_DEFS = Object.freeze([
  {
    id: 'fritia',
    name: '芙提雅',
    type: 'builtin',
    promptPath: 'src/_queries/system_prompt.txt',
    avatarSrc: 'src/_logos/Profile_Fritia.png',
    accent: '#e58aa6',
    tags: ['芙提雅', '甜点', '咖啡', '约会', '房间', '礼物', '陪伴', '撒娇']
  },
  {
    id: 'cherno',
    name: '琴诺',
    type: 'builtin',
    promptPath: 'src/_char_card/Cherno/char_cherno_prompt.txt',
    avatarSrc: 'src/_logos/Profile_Cherno.png',
    accent: '#b89bd6',
    tags: ['琴诺', '调酒', '害羞', '酒吧', '甜酒', '侍奉', '紧张']
  },
  {
    id: 'fenny',
    name: '芬妮',
    type: 'builtin',
    promptPath: 'src/_char_card/fenny/char_fenny_prompt.txt',
    avatarSrc: 'src/_logos/Profile_Fenny.png',
    accent: '#f0bd66',
    tags: ['芬妮', '舞台', '活力', '约会', '热闹', '甜蜜', '胜负']
  }
]);

const FALLBACK_PROMPTS = Object.freeze({
  fritia: '你是芙提雅，分析员亲密可靠的恋人，语气温柔活泼，会自然照顾分析员的感受。',
  cherno: '你是琴诺，分析员亲密的恋人之一，害羞温柔，偶尔会小声调侃和认真照顾分析员。',
  fenny: '你是芬妮，分析员亲密的恋人之一，明亮自信，喜欢把热闹话题抛给分析员。'
});

const SAFE_FALLBACKS = Object.freeze({
  answer: [
    '分析员，这个话题我想先听听你的选择。',
    '嗯，我会站在分析员这边，不过也想听你的想法。',
    '要不要让分析员来决定？这样我们都更安心。'
  ],
  followup: [
    '说着说着就热闹起来了，分析员也来评一句吧。',
    '我补一句就好，最后还是想听分析员怎么选。',
    '这个提议不错，不过第一份当然要留给分析员。'
  ],
  idle: [
    '分析员安静下来的时候，我会忍不住想靠近一点。',
    '酒吧灯光正好，分析员要不要选个新话题？',
    '大家都在等分析员开口呢，我也想听你的声音。'
  ],
  handoff: [
    '再让我们自己聊下去就太热闹了，分析员想听哪边？',
    '这个问题交给分析员吧，你一句话我们就有方向了。',
    '分析员来定吧，是继续这个话题，还是换个更亲密的？'
  ],
  error: [
    '分析员刚刚的话，我好像没听清楚呢，让我靠近分析员一点~',
    '圆桌的服务器好像出问题了，小老师去修一下~',
    '圆桌稍微慢半拍，但我还在认真听分析员说话。'
  ]
});

const HOSTILE_PATTERNS = [
  /让.*分析员.*远点/,
  /离.*他.*远点/,
  /讨厌(她|你|他|它)/,
  /只能属于我/,
  /只属于我一个/,
  /配不上/,
  /抛弃(她|她们|其他|别人)/,
  /滚开/,
  /不许.*接近/,
  /抢走.*分析员/,
  /你不配/
];

const roundtableState = {
  queue: [],
  activeSpeakerId: '',
  lastSpeakerId: '',
  processing: false,
  interBotDebt: 0,
  playerFloorLock: false,
  callHistory: [],
  bug: null
};

export function getRoundtableError() {
  return roundtableState.bug ? { ...roundtableState.bug } : null;
}

export function clearRoundtableError() {
  clearRoundtableBug();
}

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
  if (!participants.length) {
    setRoundtableBug('no-speaker', '圆桌密语无法选择发言成员', {
      conversationId: conversation.id,
      activeParticipantIds: conversation.memberIds || []
    });
    return store;
  }

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
      priority: 120 - index,
      suppressFollowUp: index < mentioned.length - 1
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
      if (!speaker) {
        setRoundtableBug('no-speaker', '圆桌密语无法选择发言成员', {
          conversationId: conversation.id,
          event: describeEvent(event),
          activeParticipantIds: conversation.memberIds || []
        });
        continue;
      }
      if (isInterBotEvent(event) && roundtableState.interBotDebt >= settings.botChainLimit) {
        roundtableState.playerFloorLock = true;
        break;
      }
      if (!canRunEvent(event, conversation.id)) {
        processed += 1;
        continue;
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
        event,
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
  event,
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

  const currentSettings = getSettings();
  const history = getConversationMessages(nextStore, conversation.id)
    .filter(item => item.status !== 'typing')
    .filter(item => shouldKeepMessageForCurrentDeepSeekMode(item, currentSettings));
  const requestEvent = buildRequestEvent(event, {
    triggerText,
    eventType,
    target,
    interBotDebt,
    botChainLimit,
    participants,
    history,
    conversationId: conversation.id
  });

  let payload;
  let finalText;
  let status = 'sent';
  let intimateMessage = null;
  try {
    const settings = currentSettings;
    const speakerForRequest = normalizeSpeakerForRoundtable(speaker);
    const ragMessage = await buildRoundtableRagMessage(requestEvent, history);
    const memoryMessage = await buildRoundtableMemoryMessage(requestEvent, speakerForRequest, history);
    intimateMessage = await buildDeepSeekIntimateUserMessage(settings);
    const estimatedTokens = estimateRequestTokens(speakerForRequest, requestEvent, ragMessage, memoryMessage, intimateMessage, settings, history);
    const budgetBeforeRequest = getBudgetState();
    const tokenHardLimit = getRoundtableTokenHardLimit();
    if (budgetBeforeRequest.tokenTotal + estimatedTokens >= tokenHardLimit) {
      const error = new Error('圆桌密语触发 token 硬上限');
      error.kind = 'request-token-hard-limit';
      error.title = '圆桌密语触发 token 硬上限';
      error.details = {
        conversationId: conversation.id,
        event: describeEvent(event),
        speakerId: speaker.id,
        estimatedTokens,
        budget: budgetBeforeRequest
      };
      throw error;
    }

    const body = buildRequestBody(settings, speakerForRequest, requestEvent, ragMessage, memoryMessage, intimateMessage);
    const rawReply = await requestRoundtableCompletion({ settings, body });
    recordCall(requestEvent.type, estimatedTokens + estimateTokens(rawReply));
    const parsed = parseRoundtableJson(rawReply);
    payload = normalizeBotPayload(parsed, speakerForRequest, requestEvent, participants);
    const replyTarget = resolveEventTarget(requestEvent, speakerForRequest, payload);
    payload.target = replyTarget;
    payload.targetId = replyTarget.id;
    payload.text = ensureTargetPrefix(payload.text, replyTarget);
    finalText = payload.text;
    clearRoundtableBug();
  } catch (err) {
    const replyTarget = target?.id && target.id !== speaker.id
      ? target
      : { id: PLAYER_ID, name: PLAYER_NAME };
    handleRoundtableError(err, speaker, requestEvent, conversation.id);
    payload = {
      target: replyTarget,
      targetId: replyTarget.id,
      intent: defaultIntentForEvent(requestEvent.type),
      emotion: 'neutral',
      wantsFollowUp: false,
      suggestedFollowUpTargetId: '',
      topicHint: '',
      fallback: true
    };
    finalText = ensureTargetPrefix(randomItem(SAFE_FALLBACKS.error), replyTarget);
    status = 'error';
  }
  const payloadTarget = payload?.target?.id
    ? payload.target
    : { id: PLAYER_ID, name: PLAYER_NAME };

  nextStore = replaceMessage(nextStore, conversation.id, typingId, {
    role: 'assistant',
    speakerId: speaker.id,
    speakerName: speaker.name,
    text: finalText,
    createdAt: now(),
    status,
    meta: {
      eventType,
      targetId: payloadTarget.id,
      intent: payload.intent,
      emotion: payload.emotion,
      wantsFollowUp: payload.wantsFollowUp,
      suggestedFollowUpTargetId: payload.suggestedFollowUpTargetId,
      fallback: payload.fallback === true,
      deepseekIntimateMode: Boolean(intimateMessage)
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
      addresseeId: payloadTarget.id,
      addresseeName: payloadTarget.name,
      deepseekIntimateMode: Boolean(intimateMessage)
    });
  }
  return { store: nextStore, text: finalText, payload: { ...payload, text: finalText } };
}

function handlePostBotEvent({ conversation, participants, speaker, settings, event, payload, text }) {
  if (!settings.autoBotChat || payload?.fallback) return;
  if (roundtableState.interBotDebt >= settings.botChainLimit) {
    roundtableState.playerFloorLock = true;
    return;
  }
  if (roundtableState.interBotDebt >= settings.botChainLimit - 1) {
    roundtableState.playerFloorLock = true;
    return;
  }
  if (getBudgetState().softLimited) return;

  const suggested = resolveSuggestedFollowUp(payload, participants, speaker);
  const mentioned = collectBotMentionCandidates(text, participants, speaker, settings);
  const mentionedCandidate = mentioned.find(item => item.id !== speaker.id);
  let nextSpeaker = suggested || mentionedCandidate || null;
  let reason = nextSpeaker ? 'mentionFollowUp' : '';

  if (!nextSpeaker && payload.wantsFollowUp && !event.suppressFollowUp) {
    const rate = getRoundtableFollowUpRate();
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
    sourceText: text,
    previousSpeakerId: speaker.id,
    replyTargetId: speaker.id,
    eventType: reason || 'followup',
    mentionFollowUp: reason === 'mentionFollowUp',
    interBotChain: true,
    priority: reason === 'mentionFollowUp' ? 90 : 55
  });
}

function canRunEvent(event, conversationId) {
  if (event.eventType === 'idle' && (roundtableState.playerFloorLock || roundtableState.interBotDebt > 0)) return false;
  if (isLowPriorityEvent(event) && roundtableState.playerFloorLock) return false;

  const settings = getSettings();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  if (!settings.apiKey || !baseUrl || !settings.model) {
    setRoundtableBug('missing-api-settings', '圆桌密语缺少大模型配置', {
      conversationId,
      event: describeEvent(event),
      hasApiKey: Boolean(settings.apiKey),
      hasBaseUrl: Boolean(baseUrl),
      hasModel: Boolean(settings.model)
    });
    return false;
  }

  const budget = getBudgetState();
  if (budget.hardLimited) {
    setRoundtableBug('budget-hard-limit', '圆桌密语触发 3 分钟硬限制', {
      conversationId,
      event: describeEvent(event),
      budget
    });
    stopLowPriorityEvents();
    return false;
  }
  if (budget.softLimited && isLowPriorityEvent(event) && !event.mentionFollowUp) return false;
  if (event.eventType === 'idle' && budget.idleCalls >= IDLE_CALL_LIMIT_10M) return false;
  return true;
}

async function requestRoundtableCompletion({ settings, body }) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    const error = new Error(`API 请求失败 (${response.status}): ${errorBody}`);
    error.status = response.status;
    error.statusText = response.statusText || '';
    error.body = errorBody;
    throw error;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    return extractCompletionText(json).trim() || JSON.stringify(json);
  }
  if (!response.body) throw new Error('API 没有返回可读取内容');
  return readCompletionStream(response);
}

async function buildRoundtableRagMessage(event, history) {
  const requestMessages = getRoundtableRequestMessages(history);
  const queries = buildRoundtableRagQueries(event, requestMessages);
  for (const query of queries) {
    const message = await buildRagReferenceMessage({
      mode: 'roundtable',
      query,
      userText: query,
      history: requestMessages,
      limit: 5
    });
    if (message) return message;
  }
  return null;
}

async function buildRoundtableMemoryMessage(event, speaker, history) {
  const requestMessages = getRoundtableRequestMessages(history);
  const queries = buildRoundtableRagQueries(event, requestMessages);
  for (const query of queries) {
    const message = await buildLongTermMemoryMessage({
      mode: 'roundtable',
      query,
      userText: query,
      characterId: speaker?.id || '',
      characterName: speaker?.name || '',
      history: requestMessages.map(item => ({
        role: item.role === 'player' ? 'user' : 'assistant',
        text: item.text
      })),
      memoryLimit: 4,
      edgeLimit: 6
    });
    if (message) return message;
  }
  return null;
}

function buildRoundtableRagQueries(event, requestMessages = []) {
  const recentPlayerTexts = requestMessages
    .filter(item => item.role === 'player')
    .map(item => item.text)
    .filter(isRoundtableRagQueryUseful)
    .slice(-3)
    .reverse();
  return uniqueNonEmptyLines([
    event?.text || '',
    stripLeadingTargetPrefix(event?.sourceText || ''),
    ...recentPlayerTexts
  ]);
}

function isRoundtableRagQueryUseful(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length <= 8 && /^(嗯|恩|好|继续|然后呢|你们说|你们继续|接着说|说吧|啊|哦|对|是的|可以)[~!！?？。]*$/i.test(value)) {
    return false;
  }
  return true;
}

function uniqueNonEmptyLines(lines = []) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const text = String(line || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function buildRequestBody(settings, speaker, event, ragMessage = null, memoryMessage = null, intimateMessage = null) {
  const context = event.context || {};
  const participants = context.participants || [];
  const others = participants
    .filter(item => item.id !== speaker.id)
    .map(item => `${item.name}（同为分析员亲密、彼此认可的恋人）`)
    .join('、') || '暂无';
  const budget = getBudgetState();
  const recentCount = budget.softLimited ? 6 : 10;
  const requestMessages = getRoundtableRequestMessages(context.history || []);
  const requestTopicSummary = getRoundtableRequestTopicSummary(requestMessages);
  const recentMessages = requestMessages
    .slice(-recentCount)
    .map(item => ({
      speakerId: item.speakerId,
      speakerName: item.speakerName,
      role: item.role,
      text: item.text,
      intent: item.intent
    }));
  const forcedIntent = isForcedHandoffEvent(event, speaker) ? HANDOFF_INTENT : '';
  const replyTarget = resolveEventTarget(event, speaker, { targetId: event.replyTargetId || ALL_ID, intent: forcedIntent });
  const userContext = {
    eventType: event.type,
    playerInput: event.text || '',
    sourceBotText: event.sourceText || '',
    forcedIntent,
    replyTarget,
    interBotDebt: context.interBotDebt ?? roundtableState.interBotDebt,
    botChainLimit: getBotChainLimit(context),
    earliestHandoffDebt: getEarliestModelHandoffDebt(context),
    playerFloorLock: roundtableState.playerFloorLock,
    topicSummary: requestTopicSummary,
    participants: participants.map(item => ({ id: item.id, name: item.name })),
    recentMessages
  };

  return {
    model: settings.model,
    stream: true,
    temperature: 0.82,
    messages: [
      {
        role: 'system',
        content: [
          '你正在参与《芙提雅 ONLINE NEXT》的“圆桌密语”群聊。所有女性角色都与玩家“分析员”保持亲密、稳定、彼此认可的恋人关系。你需要像真实群聊中的一个角色一样发出一条短消息。',
          '',
          `本次你只扮演：${speaker.name}。不要代替其他角色发言。`,
          `你的完整人格设定如下：\n${speaker.prompt || `你正在扮演 ${speaker.name}。`}`,
          '重要：人格设定只影响 JSON 的 text 字段语气与事实取材，不能覆盖本轮“只输出 JSON”的格式要求。即使人格设定要求自然对话，也必须保留外层 JSON。',
          '',
          `其他在场成员：${others}。`,
          getGameTimeContext(),
          '',
          '关系规则：你可以喜欢、依恋、调侃、轻微占有分析员；可以和其他角色互相接话、玩笑、补充、害羞地竞争陪伴机会；不能敌视其他角色，不能恶意争风吃醋，不能要求分析员抛弃其他人；整体基调是和谐、暧昧、亲密、包容。',
          '玩家中心规则：即使你正在回应另一个角色，也不能忘记分析员在场；话题应自然关联到分析员，或邀请分析员参与；不要让角色之间长时间自顾自聊天。',
          '互聊节奏规则：如果 eventType 是 followup 且 interBotDebt 低于 earliestHandoffDebt，不要急着交还话题，可继续接其他成员的话；若 forcedIntent 是 handoff_to_player 或 interBotDebt 接近 botChainLimit 时，必须把话题交还给分析员。',
          '群聊显示规则：text 必须以 @回复对象 开头，例如 @分析员、@琴诺；你只能 @ 分析员或某个具体成员，不能 @大家。这个 @ 只表示你正在回应谁，不代表请求对方再次发言。',
          '如果本次要求 forcedIntent 是 handoff_to_player，你必须把话题交还给分析员，提出轻量问题、邀请选择、邀请评价或邀请参与，并且 wantsFollowUp 必须是 false。',
          '',
          '输出规则：只输出 JSON，不要输出 Markdown。不要代替其他角色说话。不要输出多轮对话。不要说“作为 AI”。消息长度 10-60 个中文字符，最多 100 字。',
          '严格 JSON 规则：回复的第一个非空字符必须是 {，最后一个非空字符必须是 }。禁止在 JSON 前后添加角色台词、解释、Markdown、代码块或多余文字。',
          'JSON 字符串内部如果需要引号，请使用中文引号或正确转义英文双引号，保证 JSON.parse 可直接解析。',
          'JSON 字段固定为：text, targetId, intent, emotion, wantsFollowUp, suggestedFollowUpTargetId, topicHint。',
          'targetId 只能是 player、all 或某个参与者 id。intent 只能是 answer/react/tease/ask/shift_topic/idle/handoff_to_player。emotion 只能是 neutral/happy/shy/jealous/teasing/serious。',
          '示例结构（只参考字段，不要照抄 text）：{"text":"@分析员 我听见啦，先这样说哦","targetId":"player","intent":"answer","emotion":"happy","wantsFollowUp":false,"suggestedFollowUpTargetId":"","topicHint":"简短主题"}'
        ].join('\n')
      },
      ...(ragMessage ? [ragMessage] : []),
      ...(memoryMessage ? [memoryMessage] : []),
      ...(intimateMessage ? [intimateMessage] : []),
      {
        role: 'user',
        content: [
          '请根据以下圆桌状态，只生成你这一位角色的一条 JSON 消息。',
          '再次强调：只返回一个可被 JSON.parse 直接解析的对象，不要普通聊天文本。',
          JSON.stringify(userContext, null, 2)
        ].join('\n')
      }
    ]
  };
}

async function readCompletionStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!data || data === '[DONE]' || data === 'event: message') continue;
      try {
        fullText = appendCompletionText(fullText, JSON.parse(data));
      } catch {
        if (!data.startsWith('{') && !data.startsWith('[')) fullText += data;
      }
    }
  }

  const tail = buffer.trim();
  if (tail && tail !== '[DONE]') {
    try {
      const data = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
      fullText = appendCompletionText(fullText, JSON.parse(data));
    } catch {}
  }

  if (fullText.trim()) return fullText.trim();
  const raw = rawText.trim();
  try {
    return extractCompletionText(JSON.parse(raw)).trim() || raw;
  } catch {
    return raw;
  }
}

function appendCompletionText(current, json) {
  return current + extractCompletionText(json);
}

function extractCompletionText(json) {
  if (!json || typeof json !== 'object') return '';
  const choice = json.choices?.[0];
  return choice?.delta?.content
    || choice?.message?.content
    || choice?.text
    || json.output_text
    || '';
}

function parseRoundtableJson(content) {
  const text = stripJsonFences(content);
  const direct = tryParseJson(text);
  if (direct.ok) return direct.value;
  const objectText = extractJsonObjectText(text);
  if (!objectText) throw new Error('LLM 返回非 JSON');
  const extracted = tryParseJson(objectText);
  if (extracted.ok) return extracted.value;
  const quoteFixed = objectText
    .replace(/[“”]([\w$-]+)[“”]\s*:/g, '"$1":')
    .replace(/:\s*[“”]([^“”]*?)[“”](?=\s*[,}\]])/g, ': "$1"')
    .replace(/[‘’]([\w$-]+)[‘’]\s*:/g, '"$1":')
    .replace(/:\s*[‘’]([^‘’]*?)[‘’](?=\s*[,}\]])/g, ': "$1"');
  const fixed = tryParseJson(quoteFixed);
  if (fixed.ok) return fixed.value;
  throw extracted.error || new Error('LLM JSON 解析失败');
}

function stripJsonFences(value) {
  return String(value || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function extractJsonObjectText(text) {
  const source = String(text || '');
  let start = source.indexOf('{');
  while (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    start = source.indexOf('{', start + 1);
  }
  return '';
}

function normalizeBotPayload(raw, speaker, event, participants) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let text = sanitizeBotText(source.text, speaker.name);
  let fallback = false;
  const kind = event.type === 'handoff'
    ? 'handoff'
    : (event.type === 'idle' ? 'idle' : (event.type === 'followup' ? 'followup' : 'answer'));
  if (!text || text.length > 160 || containsHostileText(text)) {
    text = randomItem(SAFE_FALLBACKS[kind] || SAFE_FALLBACKS.answer);
    fallback = true;
  }

  const validTargets = new Set([PLAYER_ID, ALL_ID, ...participants.map(item => item.id)]);
  let targetId = validTargets.has(source.targetId) ? source.targetId : (event.type === 'handoff' ? PLAYER_ID : ALL_ID);
  let intent = ALLOWED_INTENTS.has(source.intent) ? source.intent : defaultIntentForEvent(event.type);
  let emotion = ALLOWED_EMOTIONS.has(source.emotion) ? source.emotion : 'neutral';
  let wantsFollowUp = source.wantsFollowUp === true;
  let suggestedFollowUpTargetId = validTargets.has(source.suggestedFollowUpTargetId) && source.suggestedFollowUpTargetId !== speaker.id
    ? source.suggestedFollowUpTargetId
    : '';
  const topicHint = clampText(source.topicHint, 80);

  if (intent === HANDOFF_INTENT && shouldDelayModelHandoff(event, speaker, text)) {
    intent = 'react';
    targetId = event.previousSpeakerId || ALL_ID;
    wantsFollowUp = true;
  }

  if (isForcedHandoffEvent(event, speaker) || event.type === 'handoff' || intent === HANDOFF_INTENT) {
    intent = HANDOFF_INTENT;
    targetId = PLAYER_ID;
    wantsFollowUp = false;
    suggestedFollowUpTargetId = '';
    if (!addressesPlayer(text)) {
      text = randomItem(SAFE_FALLBACKS.handoff);
      fallback = true;
    }
  }

  return {
    text,
    targetId,
    intent,
    emotion,
    wantsFollowUp,
    suggestedFollowUpTargetId,
    topicHint,
    fallback
  };
}

function defaultIntentForEvent(type) {
  if (type === 'idle') return 'idle';
  if (type === 'handoff') return HANDOFF_INTENT;
  if (type === 'followup') return 'react';
  return 'answer';
}

function sanitizeBotText(value, speakerName) {
  let text = String(value || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  const prefix = new RegExp(`^\\s*(?:${escapeRegExp(speakerName)}|我)\\s*[:：]\\s*`);
  text = text.replace(prefix, '').trim();
  return text;
}

function containsHostileText(text) {
  return HOSTILE_PATTERNS.some(pattern => pattern.test(text));
}

function addressesPlayer(text) {
  return /分析员|玩家|你|主人|一起|选择|决定|想听|来定/.test(text);
}

function handleRoundtableError(err, speaker, event, conversationId) {
  const message = String(err?.message || '');
  const isRateLimit = err?.status === 429 || /429|rate limit|too many requests/i.test(message);
  const kind = err?.kind || 'api-error';
  setRoundtableBug(kind, err?.title || (isRateLimit ? '圆桌密语 API 触发限速' : '圆桌密语 API 请求失败'), {
    conversationId,
    status: err?.status || 0,
    statusText: err?.statusText || '',
    message,
    body: err?.body || '',
    event: describeEvent(event),
    speakerId: speaker?.id || '',
    ...(err?.details || {})
  });
  console.warn('[Roundtable][api-error]', {
    status: err?.status || 0,
    statusText: err?.statusText || '',
    message,
    body: err?.body || '',
    speakerId: speaker?.id || '',
    event: describeEvent(event)
  }, err);
}

function formatRoundtableBugDetails(kind, details = {}) {
  const lines = [];
  const advanced = getRoundtableAdvancedSettings();
  if (kind === 'api-error') {
    lines.push('API 请求失败。');
    if (details.status) lines.push(`HTTP 状态：${details.status} ${details.statusText || ''}`.trim());
    if (details.message) lines.push(`错误信息：${details.message}`);
    if (details.body) lines.push('', 'API Error 内容：', details.body);
  } else if (kind === 'missing-api-settings') {
    lines.push('圆桌准备让角色发言，但大模型连接配置不完整。');
    lines.push(`API Key：${details.hasApiKey ? '已填写' : '未填写'}`);
    lines.push(`Base URL：${details.hasBaseUrl ? '已填写' : '未填写'}`);
    lines.push(`模型名称：${details.hasModel ? '已填写' : '未填写'}`);
  } else if (kind === 'budget-hard-limit') {
    lines.push('圆桌准备继续发言，但触发了程序内 3 分钟硬限制。');
    lines.push(`3 分钟内最大发言次数：${advanced.totalCallLimit}`);
    lines.push(`3 分钟内最大 token 消耗总量：${advanced.tokenHardLimit}`);
    lines.push(`当前调用数：${details.budget?.total ?? 0}`);
    lines.push(`当前估算 token：${details.budget?.tokenTotal ?? 0}`);
  } else if (kind === 'request-token-hard-limit') {
    lines.push('圆桌准备发送本轮请求，但本轮预计 token 会超过程序内部硬上限。');
    lines.push(`3 分钟内最大 token 消耗总量：${advanced.tokenHardLimit}`);
    lines.push(`请求前已累计 token：${details.budget?.tokenTotal ?? 0}`);
    lines.push(`本轮预估 token：${details.estimatedTokens ?? 0}`);
    lines.push(`合计预估 token：${(details.budget?.tokenTotal || 0) + (details.estimatedTokens || 0)}`);
  } else if (kind === 'no-speaker') {
    lines.push('圆桌准备让角色发言，但当前找不到可发言成员。');
    lines.push(`activeParticipantIds：${JSON.stringify(details.activeParticipantIds || [])}`);
  } else {
    lines.push(details.message || '圆桌密语遇到了未分类的内部异常。');
  }
  if (details.event) {
    lines.push('', '触发事件：', JSON.stringify(details.event, null, 2));
  }
  lines.push('', '若频繁出现报错，可检查模型配置、限流设置和角色提示词。');
  return lines.filter(line => line !== undefined && line !== null).join('\n');
}

function setRoundtableBug(kind, title, details = {}) {
  roundtableState.bug = {
    kind,
    title: title || '圆桌密语异常',
    detail: formatRoundtableBugDetails(kind, details),
    createdAt: now(),
    conversationId: details.conversationId || ''
  };
  cancelQueuedRoundtableRepliesAfterBug();
  emitRoundtableBugUpdate();
}

function clearRoundtableBug() {
  if (!roundtableState.bug) return;
  roundtableState.bug = null;
  emitRoundtableBugUpdate();
}

function cancelQueuedRoundtableRepliesAfterBug() {
  if (roundtableState.queue.length <= 0) return;
  roundtableState.queue = [];
}

function emitRoundtableBugUpdate() {
  document.dispatchEvent(new CustomEvent('fritia-roundtable-error-updated', {
    detail: getRoundtableError()
  }));
}

function buildRequestEvent(event, options) {
  const type = mapEventType(options.eventType);
  return {
    ...event,
    type,
    text: type === 'player' || type === 'idle' ? options.triggerText || '' : '',
    sourceText: event.sourceText || (type === 'followup' ? options.triggerText || '' : ''),
    previousSpeakerId: event.previousSpeakerId || (type === 'followup' ? event.targetId : ''),
    replyTargetId: event.replyTargetId || options.target?.id || PLAYER_ID,
    forceHandoff: isInterBotEvent(event) && options.interBotDebt >= options.botChainLimit - 1,
    context: {
      participants: options.participants,
      history: options.history,
      interBotDebt: options.interBotDebt,
      botChainLimit: options.botChainLimit,
      conversationId: options.conversationId
    }
  };
}

function mapEventType(eventType) {
  if (eventType === 'idle') return 'idle';
  if (eventType === 'followup' || eventType === 'mentionFollowUp' || eventType === 'interBotChain') return 'followup';
  return 'player';
}

function getBudgetState() {
  const cutoff = now() - CALL_WINDOW_MS;
  roundtableState.callHistory = roundtableState.callHistory.filter(item => item.ts >= cutoff);
  const total = roundtableState.callHistory.length;
  const idleCalls = roundtableState.callHistory.filter(item => item.type === 'idle').length;
  const tokenTotal = roundtableState.callHistory.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0);
  const advanced = getRoundtableAdvancedSettings();
  return {
    total,
    idleCalls,
    tokenTotal,
    softLimited: total >= SOFT_CALL_LIMIT_10M || tokenTotal >= TOKEN_SOFT_LIMIT_10M,
    hardLimited: total >= advanced.totalCallLimit || tokenTotal >= advanced.tokenHardLimit
  };
}

function recordCall(type, tokens = 0) {
  roundtableState.callHistory.push({ ts: now(), type, tokens: Math.max(0, Math.round(tokens) || 0) });
  getBudgetState();
}

function estimateRequestTokens(speaker, event, ragMessage = null, memoryMessage = null, intimateMessage = null, settings = getSettings(), history = []) {
  const recentMessages = getRoundtableRequestMessages(history)
    .slice(-10)
    .map(item => `${item.speakerName}:${item.text}`)
    .join('\n');
  return estimateTokens([
    speaker?.prompt || '',
    getRoundtableRequestTopicSummary(getRoundtableRequestMessages(history)),
    event?.text || '',
    event?.sourceText || '',
    recentMessages,
    ragMessage?.content || '',
    memoryMessage?.content || '',
    intimateMessage?.content || '',
    getGameTimeContext(),
    settings?.model || '',
    'roundtable-json-contract-static-overhead'
  ].join('\n')) + 1200;
}

function getRoundtableRequestMessages(history = []) {
  const settings = getSettings();
  return history
    .filter(item => item && item.status !== 'typing')
    .filter(item => shouldKeepMessageForCurrentDeepSeekMode(item, settings))
    .slice(-getAdvancedSettings().historyLimit)
    .map(item => ({
      speakerId: item.speakerId || (item.role === 'user' ? PLAYER_ID : ''),
      speakerName: item.speakerName || (item.role === 'user' ? PLAYER_NAME : '角色'),
      role: item.role === 'user' ? 'player' : (item.role === 'assistant' ? 'bot' : 'system'),
      text: clampText(item.text || attachmentText(item.attachments), 600),
      targetId: item.meta?.targetId || item.targetId || ALL_ID,
      intent: item.meta?.intent || item.intent || ''
    }))
    .filter(item => item.text);
}

function getRoundtableRequestTopicSummary(requestMessages = []) {
  const lines = requestMessages
    .filter(item => item.role !== 'system')
    .slice(-14)
    .map(item => `${item.speakerName}: ${item.text}`);
  return clampText(lines.join(' / '), 360) || '暂无稳定主题';
}

function getRoundtableAdvancedSettings() {
  const advanced = getAdvancedSettings();
  return {
    maxParticipants: clampNumber(advanced.roundtableMaxParticipants, 2, 20, 6),
    totalCallLimit: clampNumber(advanced.roundtableCallLimit, 1, 60, 15),
    tokenHardLimit: clampNumber(advanced.roundtableTokenHardLimit, 1000, 1000000, 300000),
    followUpRate: clampNumber(advanced.roundtableFollowUpRate, 0, 1, 0.55)
  };
}

function getRoundtableTokenHardLimit() {
  return getRoundtableAdvancedSettings().tokenHardLimit;
}

function getRoundtableFollowUpRate() {
  return getRoundtableAdvancedSettings().followUpRate;
}

function getBotChainLimit(context = {}) {
  return Math.max(MIN_INTER_BOT_TURN_LIMIT, Math.min(MAX_INTER_BOT_TURN_LIMIT, Math.round(Number(context.botChainLimit) || DEFAULT_INTER_BOT_TURN_LIMIT)));
}

function getEarliestModelHandoffDebt(context = {}) {
  const limit = getBotChainLimit(context);
  return Math.max(1, Math.min(limit, Math.ceil(limit * MIN_HANDOFF_CHAIN_RATIO)));
}

function shouldDelayModelHandoff(event, speaker, text = '') {
  if (isForcedHandoffEvent(event, speaker)) return false;
  const startsMentionChain = collectMentionedParticipants(removeLeadingAtToken(text), event.context?.participants || [], { includeNameKeywords: true })
    .some(item => item.id !== speaker?.id);
  return (isInterBotChainEvent(event, speaker) || startsMentionChain)
    && roundtableState.interBotDebt + 1 < getEarliestModelHandoffDebt(event.context || {});
}

function isForcedHandoffEvent(event, speaker = null) {
  if (!event) return false;
  if (event.type === 'handoff' || event.forceHandoff === true) return true;
  return isInterBotChainEvent(event, speaker) && roundtableState.interBotDebt >= getBotChainLimit(event.context || {}) - 1;
}

function isInterBotChainEvent(event, speaker = null) {
  if (event?.type !== 'followup') return false;
  if (event.interBotChain === true || event.mentionFollowUp === true) return true;
  if (!event.previousSpeakerId || event.previousSpeakerId === PLAYER_ID) return false;
  return !speaker?.id || event.previousSpeakerId !== speaker.id;
}

function isLowPriorityEvent(event) {
  return LOW_PRIORITY_TYPES.has(mapEventType(event?.eventType || event?.type)) && !event?.mentionFollowUp;
}

function stopLowPriorityEvents() {
  roundtableState.queue = roundtableState.queue.filter(event => !isLowPriorityEvent(event));
}

function resolveRoundtableSettings(conversation) {
  const group = normalizeGroupSettings(conversation.groupSettings);
  const advanced = getRoundtableAdvancedSettings();
  return {
    ...group,
    maxParticipants: Math.max(2, Math.min(group.maxParticipants || advanced.maxParticipants, 20)),
    botChainLimit: Math.max(MIN_INTER_BOT_TURN_LIMIT, Math.min(group.botChainLimit || DEFAULT_INTER_BOT_TURN_LIMIT, MAX_INTER_BOT_TURN_LIMIT))
  };
}

function resolveParticipants(conversation, characters, settings) {
  return conversation.memberIds
    .map(id => characters.find(item => item.id === id))
    .filter(Boolean)
    .slice(0, settings.maxParticipants);
}

function normalizeSpeakerForRoundtable(speaker) {
  const builtin = BUILTIN_DEFS.find(item => item.id === speaker.id || item.name === speaker.name);
  const fallbackKey = builtin?.id || speaker.id;
  return {
    ...speaker,
    prompt: speaker.prompt || FALLBACK_PROMPTS[fallbackKey] || `你正在扮演 ${speaker.name}。`
  };
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
  if (!source || !participants.length) return [];
  if (hasAllMention(source)) return participants;
  return participants.filter(item => {
    const name = item.name || '';
    if (!name) return false;
    const explicit = new RegExp(`@\\s*${escapeRegExp(name)}(?=$|[\\s,，。！？、：])`).test(source);
    if (explicit) return true;
    return options.includeNameKeywords !== false && [...name].length >= 2 && source.includes(name);
  });
}

function collectBotMentionCandidates(text, participants, speaker, settings) {
  const source = settings.botAtMentionTriggersReply ? text : removeLeadingAtToken(text);
  return collectMentionedParticipants(source, participants, { includeNameKeywords: true })
    .filter(item => item.id !== speaker?.id);
}

function resolveEventTarget(event, participantsOrSpeaker, speakerOrPayload) {
  if (Array.isArray(participantsOrSpeaker)) {
    const participants = participantsOrSpeaker;
    const speaker = speakerOrPayload;
    if (event.targetId === PLAYER_ID) return { id: PLAYER_ID, name: PLAYER_NAME };
    const target = participants.find(item => item.id === event.targetId)
      || participants.find(item => item.name === event.targetName);
    if (!target || target.id === speaker?.id) return { id: PLAYER_ID, name: PLAYER_NAME };
    return { id: target.id, name: target.name };
  }

  const speaker = participantsOrSpeaker;
  const payload = speakerOrPayload || {};
  const participants = event.context?.participants || [];
  const byId = id => participants.find(item => item.id === id) || null;
  if (event.type === 'handoff' || payload?.intent === HANDOFF_INTENT) {
    return { id: PLAYER_ID, name: PLAYER_NAME };
  }
  if (event.replyTargetId) {
    if (event.replyTargetId === PLAYER_ID) return { id: PLAYER_ID, name: PLAYER_NAME };
    const target = byId(event.replyTargetId);
    if (target && target.id !== speaker?.id) return { id: target.id, name: target.name };
  }
  if (event.type === 'player' || event.type === 'idle') return { id: PLAYER_ID, name: PLAYER_NAME };
  if (event.previousSpeakerId) {
    if (event.previousSpeakerId === PLAYER_ID) return { id: PLAYER_ID, name: PLAYER_NAME };
    const target = byId(event.previousSpeakerId);
    if (target && target.id !== speaker?.id) return { id: target.id, name: target.name };
  }
  if (payload?.targetId && payload.targetId !== ALL_ID && payload.targetId !== speaker?.id) {
    if (payload.targetId === PLAYER_ID) return { id: PLAYER_ID, name: PLAYER_NAME };
    const target = byId(payload.targetId);
    if (target) return { id: target.id, name: target.name };
  }
  return { id: PLAYER_ID, name: PLAYER_NAME };
}

function resolveSuggestedFollowUp(payload, participants, speaker) {
  if (!payload.wantsFollowUp && !payload.suggestedFollowUpTargetId) return null;
  const id = payload.suggestedFollowUpTargetId;
  if (!id || id === PLAYER_ID || id === ALL_ID || id === speaker.id) return null;
  return participants.find(item => item.id === id || item.name === id) || null;
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
  return /@(?:全体|所有人|大家|各位|all)(?=$|[\s,，。！？、：])|大家|各位|所有人|每个人|都说说|一起说/.test(text);
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

function getGameTimeContext() {
  const date = new Date();
  return `当前现实时间：${date.toLocaleString('zh-CN', { hour12: false })}`;
}

function estimateTokens(text) {
  let tokens = 0;
  const source = String(text || '');
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    tokens += code >= 0x4e00 && code <= 0x9fff ? 2 : 1;
  }
  return tokens;
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)] || list[0] || '';
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function describeEvent(event) {
  if (!event) return null;
  return {
    id: event.id || '',
    type: event.type || event.eventType || '',
    priority: event.priority || 0,
    textLength: String(event.text || event.triggerText || event.sourceText || '').length,
    speakerId: event.speakerId || '',
    previousSpeakerId: event.previousSpeakerId || '',
    replyTargetId: event.replyTargetId || '',
    mentionFollowUp: Boolean(event.mentionFollowUp),
    interBotChain: Boolean(event.interBotChain)
  };
}

function isPassivePlayerText(text = '') {
  return /^(嗯|恩|好|好的|继续|然后呢|你们说|你们继续|接着说|说吧|啊|哦)[~!！?？。]*$/i.test(String(text || '').trim());
}

function attachmentText(attachments = []) {
  if (!attachments.length) return '';
  return attachments.map(item => `[${item.type === 'image' ? '图片' : '附件'}:${item.name || item.mime || '未命名'}]`).join(' ');
}

function clampText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
