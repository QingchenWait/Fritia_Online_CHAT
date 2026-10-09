// Only failures registered by a request in this running APP are transient.
// Historical statuses and message text never determine a failed turn.
const failedMessages = new Map();

export function markFailedTurn(conversationId, messageIds = []) {
  let ids = failedMessages.get(conversationId);
  if (!ids) failedMessages.set(conversationId, ids = new Set());
  messageIds.filter(Boolean).forEach(id => ids.add(id));
}

export function isFailedTurnMessage(message, conversationId) {
  return failedMessages.get(conversationId)?.has(message.id) === true;
}

export function filterFailedTurnHistory(messages, conversationId) {
  return messages.filter(message => !isFailedTurnMessage(message, conversationId));
}

export function persistentChatStore(store) {
  return { ...store, messages: Object.fromEntries(Object.entries(store.messages || {})
    .map(([id, messages]) => [id, filterFailedTurnHistory(messages, id)])) };
}
