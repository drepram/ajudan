import { runDigest } from "./digest.js";

export function createDigestService({ api, store, config }) {
  return {
    async run() {
      try {
        return await runDigest({
          store,
          config,
          complete: (request) => api.runtime.llm.complete(request),
          deliver: async ({ to, text }) => {
            const adapter = await api.runtime.channel.outbound.loadAdapter("whatsapp");
            if (typeof adapter?.sendText !== "function") throw new Error("WhatsApp outbound adapter is unavailable");
            await adapter.sendText({ cfg: api.runtime.config.current({ clone: true }), to, text });
          },
        });
      } catch (error) {
        api.logger.error("Ajudan digest failed");
        throw error;
      }
    },
  };
}
