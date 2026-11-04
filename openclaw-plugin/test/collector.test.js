import test from "node:test";
import assert from "node:assert/strict";
import { register } from "../index.js";

function apiFor(config, { entriesError } = {}) {
  const rows = new Map();
  const hooks = new Map();
  const services = [];
  const logs = [];
  const logger = { warn(message) { logs.push(message); }, info(message) { logs.push(message); }, error() {} };
  const keyed = () => ({
    async registerIfAbsent(key, value) { if (rows.has(key)) return false; rows.set(key, value); return true; },
    async lookup(key) { return rows.get(key); },
    async register(key, value) { rows.set(key, value); },
    async entries() {
      if (entriesError) throw entriesError;
      return [...rows].map(([key, value]) => ({ key, value }));
    },
  });
  return {
    hooks,
    services,
    logs,
    api: {
      pluginConfig: config,
      logger,
      runtime: { state: { openKeyedStore: keyed } },
      on(name, handler) { hooks.set(name, handler); },
      registerService(service) { services.push(service); },
    },
  };
}

test("collects only allowlisted WhatsApp group events and registers no collection-time inference", async () => {
  const { api, hooks, services } = apiFor({ groupIds: ["ops@g.us"], inferenceEnabled: false });
  register(api);
  const received = hooks.get("message_received");
  for (const [event, context] of [
    [{ from: "ops@g.us", threadId: "thread-1", messageId: "1", senderId: "u1", timestamp: 1000, content: "kept" }, { channelId: "whatsapp" }],
    [{ from: "other@g.us", threadId: "thread-2", messageId: "2", senderId: "u1", timestamp: 1000, content: "ignored" }, { channelId: "whatsapp" }],
    [{ from: "ops@g.us", threadId: "thread-3", messageId: "3", senderId: "u1", timestamp: 1000, content: "ignored" }, { channelId: "telegram" }],
  ]) await received(event, context);

  assert.equal(services.length, 1);
  let schedules = 0;
  services[0].start({ scheduler: { schedule() { schedules++; } } });
  assert.equal(schedules, 0);
});

test("matches the allowlisted group from the typed event from field", async () => {
  const { api, hooks, services, logs } = apiFor({ groupIds: ["ops@g.us"], inferenceEnabled: false });
  register(api);
  await hooks.get("message_received")({
    from: "ops@g.us",
    threadId: "thread-1",
    messageId: "m1",
    senderId: "sender@s.whatsapp.net",
    timestamp: 1700000000000,
    content: "test",
  }, { channelId: "whatsapp" });
  await services[0].start({ scheduler: { schedule() { assert.fail("inference should remain disabled"); } } });

  assert.match(logs.find((line) => line.startsWith("Ajudan capture status:")), /storedMessages=1/);
});

test("claims allowlisted WhatsApp messages before agent dispatch", async () => {
  const { api, hooks } = apiFor({ groupIds: ["ops@g.us"] });
  register(api);
  const beforeDispatch = hooks.get("before_dispatch");

  assert.deepEqual(await beforeDispatch({ channel: "whatsapp" }, {
    channelId: "whatsapp",
    conversationId: "ops@g.us",
  }), { handled: true });
  assert.equal(await beforeDispatch({ channel: "whatsapp" }, {
    channelId: "whatsapp",
    conversationId: "other@g.us",
  }), undefined);
  assert.equal(await beforeDispatch({ channel: "telegram" }, {
    channelId: "telegram",
    conversationId: "ops@g.us",
  }), undefined);
});

test("empty or wildcard group configuration registers no capture hook", () => {
  for (const groupIds of [[], ["*"], [" "], ["not-a-group-id"]]) {
    const { api, hooks } = apiFor({ groupIds });
    register(api);
    assert.equal(hooks.size, 0);
  }
});

test("logs only stored message count and latest timestamp on service startup", async () => {
  const { api, hooks, services, logs } = apiFor({ groupIds: ["ops@g.us"], inferenceEnabled: false });
  register(api);
  await hooks.get("message_received")({
    from: "ops@g.us",
    threadId: "thread-1",
    messageId: "private-message-id",
    senderId: "private-sender-id",
    timestamp: 1700000000000,
    content: "private message body",
  }, { channelId: "whatsapp" });

  await services[0].start({ scheduler: { schedule() { assert.fail("inference should remain disabled"); } } });

  assert.equal(logs.find((line) => line.startsWith("Ajudan capture status:")), "Ajudan capture status: storedMessages=1 latestTimestamp=2023-11-14T22:13:20.000Z");
  assert.equal(logs.some((line) => /private-message-id|private-sender-id|private message body|ops@g\.us/.test(line)), false);
});

test("continues service startup if capture status cannot be read", async () => {
  const { api, services, logs } = apiFor({ groupIds: ["ops@g.us"], inferenceEnabled: false }, {
    entriesError: new Error("private storage error"),
  });
  register(api);

  await services[0].start({ scheduler: { schedule() { assert.fail("inference should remain disabled"); } } });

  assert.equal(logs[0], "Ajudan capture status unavailable");
  assert.equal(logs.some((line) => line.includes("private storage error")), false);
  assert.equal(logs.includes("Ajudan inference disabled; message collection remains active"), true);
});
