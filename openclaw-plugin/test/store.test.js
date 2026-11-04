import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../store.js";

function keyedStore() {
  const rows = new Map();
  return {
    rows,
    async registerIfAbsent(key, value) {
      if (rows.has(key)) return false;
      rows.set(key, value);
      return true;
    },
    async lookup(key) {
      return rows.get(key);
    },
    async register(key, value) {
      rows.set(key, value);
    },
    async entries() {
      return [...rows].map(([key, value]) => ({ key, value }));
    },
  };
}

test("records only valid messages once and reads a sorted group window", async () => {
  const messages = keyedStore();
  const state = keyedStore();
  const store = createStore({ messages, state, groupIds: ["ops@g.us"], retentionDays: 7 });
  const first = {
    groupId: "ops@g.us",
    messageId: "m-2",
    senderId: "user-1",
    timestamp: 2000,
    text: "second",
    replyTo: null,
  };

  assert.equal(await store.record(first), true);
  assert.equal(await store.record(first), false);
  assert.equal(await store.record({ ...first, messageId: "", timestamp: 3000 }), false);
  assert.equal(await store.record({ ...first, groupId: "not-a-group-id" }), false);
  await store.record({ ...first, messageId: "m-1", timestamp: 1000, text: "first" });
  assert.equal(await store.record({ ...first, groupId: "other@g.us", messageId: "m-3", timestamp: 1500 }), false);

  assert.deepEqual(await store.readWindow({ groupIds: ["ops@g.us"], from: 1000, to: 2500 }), [
    { ...first, messageId: "m-1", timestamp: 1000, text: "first" },
    first,
  ]);
  assert.deepEqual(await store.getSummary(), { count: 2, latestTimestamp: 2000 });
});

test("records valid messages when OpenClaw omits the optional sender ID", async () => {
  const messages = keyedStore();
  const store = createStore({ messages, state: keyedStore(), groupIds: ["ops@g.us"], retentionDays: 7 });
  const message = {
    groupId: "ops@g.us",
    messageId: "m-no-sender",
    timestamp: 2000,
    text: "valid message",
    replyTo: null,
  };

  assert.equal(await store.record(message), true);
  assert.deepEqual(await store.readWindow({ groupIds: ["ops@g.us"], from: 1000, to: 3000 }), [message]);
});

test("summarizes an empty store", async () => {
  const store = createStore({ messages: keyedStore(), state: keyedStore(), groupIds: [], retentionDays: 7 });
  assert.deepEqual(await store.getSummary(), { count: 0, latestTimestamp: undefined });
});

test("ignores invalid timestamps when finding the latest stored message", async () => {
  const messages = keyedStore();
  const store = createStore({ messages, state: keyedStore(), groupIds: ["ops@g.us"], retentionDays: 7 });
  await store.record({ groupId: "ops@g.us", messageId: "old", senderId: "user-1", timestamp: 1000, text: "old", replyTo: null });
  await store.record({ groupId: "ops@g.us", messageId: "new", senderId: "user-1", timestamp: 3000, text: "new", replyTo: null });
  messages.rows.set("legacy", { timestamp: "invalid" });
  messages.rows.set("out-of-range", { timestamp: Number.MAX_SAFE_INTEGER });

  assert.deepEqual(await store.getSummary(), { count: 4, latestTimestamp: 3000 });
});

test("keeps the last successful digest watermark across store instances", async () => {
  const messages = keyedStore();
  const state = keyedStore();
  const store = createStore({ messages, state, groupIds: [], retentionDays: 7 });
  await store.setWatermark(1234);
  assert.equal(await createStore({ messages, state, groupIds: [], retentionDays: 7 }).getWatermark(), 1234);
});
