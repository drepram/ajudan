import { createHash } from "node:crypto";

const WATERMARK_KEY = "last-successful-watermark";
const MAX_MESSAGE_CHARS = 20_000;

function messageKey(groupId, messageId) {
  return `message:${createHash("sha256").update(`${groupId}\0${messageId}`).digest("hex")}`;
}

export function createStore({ messages, state, groupIds, retentionDays }) {
  const allowedGroups = new Set(groupIds.filter((id) => typeof id === "string" && /^.+@g\.us$/.test(id)));
  const ttlMs = retentionDays * 24 * 60 * 60 * 1000;

  return {
    async record(message) {
      if (!allowedGroups.has(message.groupId) ||
          typeof message.messageId !== "string" || !message.messageId ||
          typeof message.senderId !== "string" || !Number.isSafeInteger(message.timestamp) ||
          typeof message.text !== "string" || message.text.length > MAX_MESSAGE_CHARS ||
          (message.replyTo !== null && typeof message.replyTo !== "string")) {
        return false;
      }
      return messages.registerIfAbsent(messageKey(message.groupId, message.messageId), message, { ttlMs });
    },

    async readWindow({ groupIds: requestedGroups, from, to }) {
      const groups = new Set(requestedGroups.filter((id) => allowedGroups.has(id)));
      if (groups.size === 0 || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from >= to) return [];
      const entries = await messages.entries();
      return entries.map(({ value }) => value)
        .filter((message) => groups.has(message.groupId) && message.timestamp >= from && message.timestamp < to)
        .sort((a, b) => a.timestamp - b.timestamp || a.messageId.localeCompare(b.messageId));
    },

    async getSummary() {
      const entries = await messages.entries();
      let latestTimestamp;
      for (const { value } of entries) {
        const timestamp = value?.timestamp;
        if (Number.isSafeInteger(timestamp) && timestamp > 0 &&
            Number.isFinite(new Date(timestamp).getTime()) && timestamp > (latestTimestamp ?? 0)) {
          latestTimestamp = timestamp;
        }
      }
      return { count: entries.length, latestTimestamp };
    },

    async getWatermark() {
      const value = await state.lookup(WATERMARK_KEY);
      return Number.isSafeInteger(value?.timestamp) ? value.timestamp : undefined;
    },

    async setWatermark(timestamp) {
      if (!Number.isSafeInteger(timestamp)) throw new TypeError("watermark must be an integer timestamp");
      await state.register(WATERMARK_KEY, { timestamp }, { ttlMs });
    },
  };
}
