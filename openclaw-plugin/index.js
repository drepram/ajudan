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
    const fromMatch = groupIds.includes(event.from);
    const conversationMatch = groupIds.includes(context.conversationId);
    if (context.channelId !== "whatsapp" || (!fromMatch && !conversationMatch)) return;

    const timestamp = Number(event.timestamp);
    const messageIdValid = typeof event.messageId === "string" && event.messageId.length > 0;
    const timestampValid = Number.isSafeInteger(timestamp) && timestamp > 0;
    const contentValid = typeof event.content === "string" && event.content.length <= 20_000;
    const replyToValid = event.replyToId === undefined || typeof event.replyToId === "string";
    const logDiagnostic = (stored) => api.logger.info(
      `Ajudan capture diagnostic: fromMatch=${fromMatch} conversationMatch=${conversationMatch} messageIdValid=${messageIdValid} timestampValid=${timestampValid} senderIdPresent=${typeof event.senderId === "string"} contentValid=${contentValid} replyToValid=${replyToValid} stored=${stored}`,
    );
    if (!fromMatch || !messageIdValid || !timestampValid || !contentValid || !replyToValid) {
      logDiagnostic(false);
      return;
    }
    try {
      const stored = await store.record({
        groupId: event.from,
        messageId: event.messageId,
        senderId: event.senderId,
        timestamp,
        text: event.content,
        replyTo: event.replyToId ?? null,
      });
      logDiagnostic(stored);
    } catch (error) {
      api.logger.error("Ajudan message capture failed");
      logDiagnostic(false);
    }
  });

  api.on("before_dispatch", (_event, context) => {
    if (context.channelId === "whatsapp" && groupIds.includes(context.conversationId)) {
      return { handled: true };
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
