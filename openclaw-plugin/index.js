import { createDigestService } from "./service.js";
import { createStore } from "./store.js";

const MAX_STORED_MESSAGES = 100_000;
const DEFAULT_RETENTION_DAYS = 30;

export function register(api) {
  const config = api.pluginConfig ?? {};
  const groupIds = Array.isArray(config.groupIds)
    ? [...new Set(config.groupIds.filter((id) => typeof id === "string" && /^.+@g\.us$/.test(id)))]
    : [];
  if (groupIds.length === 0) {
    api.logger.warn("Ajudan collection disabled: configure explicit groupIds");
    return;
  }

  const retentionDays = Number.isSafeInteger(config.retentionDays) && config.retentionDays > 0
    ? config.retentionDays
    : DEFAULT_RETENTION_DAYS;
  const messages = api.runtime.state.openKeyedStore({
    namespace: "messages",
    maxEntries: MAX_STORED_MESSAGES,
    retention: "bounded",
    overflowPolicy: "reject-new",
    defaultTtlMs: retentionDays * 24 * 60 * 60 * 1000,
  });
  const state = api.runtime.state.openKeyedStore({ namespace: "state", retention: "retained" });
  const store = createStore({ messages, state, groupIds, retentionDays });

  api.on("message_received", async (event, context) => {
    if (context.channelId !== "whatsapp" || typeof event.threadId !== "string" || !groupIds.includes(event.threadId) || !event.messageId) return;
    const timestamp = Number(event.timestamp);
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) return;
    try {
      await store.record({
        groupId: event.threadId,
        messageId: event.messageId,
        senderId: event.senderId,
        timestamp,
        text: event.content,
        replyTo: event.replyToId ?? null,
      });
    } catch (error) {
      api.logger.error("Ajudan message capture failed");
    }
  });

  api.registerService({
    id: "ajudan-digest",
    apiVersion: 2,
    async start({ scheduler }) {
      try {
        const summary = await store.getSummary();
        const latestTimestamp = summary.latestTimestamp === undefined
          ? "none"
          : new Date(summary.latestTimestamp).toISOString();
        api.logger.info(`Ajudan capture status: storedMessages=${summary.count} latestTimestamp=${latestTimestamp}`);
      } catch {
        api.logger.warn("Ajudan capture status unavailable");
      }
      if (config.inferenceEnabled !== true) {
        api.logger.info("Ajudan inference disabled; message collection remains active");
        return;
      }
      const digestConfig = {
        enabled: config.inferenceEnabled,
        groups: groupIds,
        recipient: config.recipient,
        model: config.model,
        intervalMs: 3 * 60 * 60 * 1000,
        maxInputChars: 24_000,
      };
      const digestService = createDigestService({ api, store, config: digestConfig });
      scheduler.schedule({
        id: "three-hour-digest",
        delayMs: digestConfig.intervalMs,
        everyMs: digestConfig.intervalMs,
        run: () => digestService.run(),
      });
    },
  });
}

export default { id: "ajudan", name: "Ajudan", register };
