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
});

test("keeps the last successful digest watermark across store instances", async () => {
  const messages = keyedStore();
  const state = keyedStore();
  const store = createStore({ messages, state, groupIds: [], retentionDays: 7 });
  await store.setWatermark(1234);
  assert.equal(await createStore({ messages, state, groupIds: [], retentionDays: 7 }).getWatermark(), 1234);
});
