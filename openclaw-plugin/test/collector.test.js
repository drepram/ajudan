import test from "node:test";
import assert from "node:assert/strict";
import { register } from "../index.js";

function apiFor(config) {
  const rows = new Map();
  const hooks = new Map();
  const services = [];
  const logger = { warn() {}, info() {}, error() {} };
  const keyed = () => ({
    async registerIfAbsent(key, value) { if (rows.has(key)) return false; rows.set(key, value); return true; },
    async lookup(key) { return rows.get(key); },
    async register(key, value) { rows.set(key, value); },
    async entries() { return [...rows].map(([key, value]) => ({ key, value })); },
  });
  return {
    hooks,
    services,
    api: {
      pluginConfig: config,
      logger,
      runtime: { state: { openKeyedStore: keyed } },
      registerHook(name, handler) { hooks.set(name, handler); },
      registerService(service) { services.push(service); },
    },
  };
}

test("collects only allowlisted WhatsApp group events and registers no collection-time inference", async () => {
  const { api, hooks, services } = apiFor({ groupIds: ["ops@g.us"], inferenceEnabled: false });
  register(api);
  const received = hooks.get("message_received");
  for (const [event, context] of [
    [{ from: "ops@g.us", messageId: "1", senderId: "u1", timestamp: 1000, content: "kept" }, { channelId: "whatsapp" }],
    [{ from: "other@g.us", messageId: "2", senderId: "u1", timestamp: 1000, content: "ignored" }, { channelId: "whatsapp" }],
    [{ from: "ops@g.us", messageId: "3", senderId: "u1", timestamp: 1000, content: "ignored" }, { channelId: "telegram" }],
  ]) await received(event, context);

  assert.equal(services.length, 1);
  let schedules = 0;
  services[0].start({ scheduler: { schedule() { schedules++; } } });
  assert.equal(schedules, 0);
});

test("empty or wildcard group configuration registers no capture hook", () => {
  for (const groupIds of [[], ["*"], [" "], ["not-a-group-id"]]) {
    const { api, hooks } = apiFor({ groupIds });
    register(api);
    assert.equal(hooks.size, 0);
  }
});
