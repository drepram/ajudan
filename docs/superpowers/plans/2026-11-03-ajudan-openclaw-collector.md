# Ajudan OpenClaw Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an OpenClaw extension that locally collects allowlisted WhatsApp group messages and sends a private three-hour operations digest without inference on message arrival.

**Architecture:** A local plugin observes OpenClaw inbound events, filters explicit group IDs, and persists messages and digest state. A scheduled run processes eligible messages in bounded batches through an exact approved free OpenRouter model, then delivers privately and records completion only after successful delivery.

**Tech Stack:** OpenClaw 2026.10.10 plugin API, Node.js 24 ESM, local persistence, Node's built-in test runner. Confirm the persistence API available to plugins before choosing its backing store; do not add a dependency unless the host API requires one.

**Spec:** `docs/superpowers/specs/2026-11-03-ajudan-openclaw-collector-design.md`

## Global Constraints

- Accept messages only for an explicit configured group allowlist.
- Do not make model calls on message arrival.
- Store raw messages locally with bounded retention.
- Deliver scheduled digests only to the configured private recipient.
- Use only exact approved `:free` model IDs; no auto-router or paid fallback.
- Do not enable automated inference until the OpenRouter key has a confirmed restrictive cap/guardrail.
- Do not add embeddings, MCP, or a separate WhatsApp service.
- State clearly that OpenClaw's observational/asynchronous hook may not capture every message.

## Review Focus

- Empty, wildcard, malformed, and unlisted group IDs must capture nothing.
- Duplicate delivery, malformed event fields, missing message IDs, and timestamp edge cases must not corrupt stored data or create silent duplicates.
- Restart during append or digest delivery must not silently lose messages or mark a failed batch complete.
- Missing/private recipient, invalid model ID, provider/model outage, rate limit, and budget rejection must fail closed without a public reply or paid fallback.
- Prompt-injection text and sensitive message content must not override policy or leak into logs.

---

## File map

- Create `openclaw-plugin/package.json` and `openclaw-plugin/openclaw.plugin.json`: local plugin metadata and supported host range.
- Create `openclaw-plugin/index.js`: plugin registration, message hook, and scheduled entrypoint only.
- Create `openclaw-plugin/store.js`: local persistence, idempotency, retention, and pending-window queries.
- Create `openclaw-plugin/digest.js`: allowlist/model validation, batch formatting, model request, digest/run state, and private delivery.
- Create `openclaw-plugin/test/*.test.js`: built-in tests using temporary local state and mocked Gateway/model/delivery boundaries.
- Modify `openclaw.example.json5`: add only the plugin's required placeholder configuration, preserving deny-by-default group access.
- Modify `README.md`: install/configure locally, test collection completeness, set a safe key cap, configure private destination, and describe limitations.
- Do not change `AGENTS.md` unless tests reveal a specific policy gap; retain existing digest ordering and untrusted-message guidance.

## Tasks

### Task 1: Confirm the host plugin API and lock the persistence choice

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-ajudan-openclaw-collector-design.md`
- Create: `docs/superpowers/plans/2026-11-03-ajudan-openclaw-collector.md` (update this plan if API facts change)

- [ ] Verify against OpenClaw 2026.10.10 docs/source the exact plugin entry/manifest format, inbound event hook and event payload fields, timer/scheduler API, plugin-scoped durable-storage API, model call API, and outbound WhatsApp delivery API.
- [ ] Record the exact event fields and APIs selected in the design doc; select the smallest durable local store supported by the host. If any required capability is not available, stop and update the plan rather than relying on private internals.
- [ ] Confirm install/load/enable commands and a harmless runtime test on the Linux host; the extension must not be activated against real groups before these checks.

### Task 2: Add tested local message storage

**Files:**
- Create: `openclaw-plugin/store.js`
- Test: `openclaw-plugin/test/store.test.js`

**Interfaces:**
- `createStore({ stateDir, retentionDays })` returns `record(message)`, `readWindow({ groupIds, from, to })`, `markDelivered(messageIds, digestId)`, and `prune(now)` async methods. Tests may use a temporary directory.
- Stored records contain `groupId`, `messageId`, `senderId`, `timestamp`, `text`, and nullable `replyTo`; only fields available in the host event are retained.

- [ ] Write tests for explicit group scope, event deduplication, chronological bounded-window reads, restart persistence, and retention pruning.
- [ ] Run `node --test openclaw-plugin/test/store.test.js` and confirm the tests fail before implementation.
- [ ] Implement the smallest durable local store supported by the confirmed host API; reject incomplete identity/timestamp data rather than inventing values.
- [ ] Run `node --test openclaw-plugin/test/store.test.js` and confirm all tests pass.

### Task 3: Add fail-closed collector plugin wiring

**Files:**
- Create: `openclaw-plugin/package.json`
- Create: `openclaw-plugin/openclaw.plugin.json`
- Create: `openclaw-plugin/index.js`
- Test: `openclaw-plugin/test/collector.test.js`
- Modify: `openclaw.example.json5`

**Interfaces:**
- Register one inbound handler using the exact event API confirmed in Task 1. It passes only allowlisted WhatsApp group messages to `store.record` and does no inference or reply.
- Plugin configuration has explicit `groupIds`, `stateDir`/host-managed state, and scheduler settings. Empty IDs are a hard disable.

- [ ] Test allowlisted vs unlisted groups, empty list, duplicate input, non-WhatsApp/non-group event, and that the mocked model client is never called on collection.
- [ ] Run `node --test openclaw-plugin/test/collector.test.js` and confirm tests fail before wiring.
- [ ] Implement manifest, plugin registration, config validation, collector wiring, and placeholder config using only public host APIs.
- [ ] Run the store and collector test suites; validate the example config with OpenClaw's config validator if available.

### Task 4: Add scheduled fail-closed digest and private delivery

**Files:**
- Create: `openclaw-plugin/digest.js`
- Test: `openclaw-plugin/test/digest.test.js`
- Modify: `openclaw-plugin/index.js`

**Interfaces:**
- `runDigest({ store, config, from, to, modelClient, deliver, now })` returns a run result with status, source interval, groups, and digest ID; all external operations are injected for tests.
- `config.model` must exactly equal one of the approved model IDs configured by the operator and must end in `:free`; no model default or automatic fallback is allowed.
- `config.recipient` is mandatory and must be a private WhatsApp destination.

- [ ] Test no eligible messages, invalid/paid/auto model IDs, absent recipient, model error/429, delivery error, successful delivery, source interval boundaries, and untrusted instruction text.
- [ ] Run `node --test openclaw-plugin/test/digest.test.js` and confirm tests fail before implementation.
- [ ] Implement one bounded chronological batch per scheduled interval; log only status/count/IDs, never raw message bodies or credentials.
- [ ] Mark a batch delivered only after delivery succeeds; on failure leave it eligible for controlled retry without switching models.
- [ ] Run all tests and confirm a test spy observes only configured exact `:free` model IDs and only the private destination.

### Task 5: Document setup, safety gates, and capture validation

**Files:**
- Modify: `README.md`
- Modify: `openclaw.example.json5`

- [ ] Document plugin installation on the Linux Gateway, exact placeholders to replace, 3-hour scheduling, no embeddings, and no per-message inference.
- [ ] Document setting the OpenRouter key's own limit/guardrail in the dashboard and explicitly keeping inference disabled until the restriction is confirmed; do not ask the user to run a paid-model probe.
- [ ] Document a harmless test protocol: observe messages in a temporary/test group, compare each sent message to stored records, restart Gateway, verify deduplication and restart behavior, and verify private-only delivery before enabling real groups.
- [ ] State that observational hooks may miss events and that summaries are not reliable until the test passes; document bounded retention and how to disable collection.
- [ ] Run all Node tests, `openclaw config validate` where available, check `git diff --check`, and scan tracked files for credentials, actual group IDs, and phone numbers.

## Execution boundary

Do not enable scheduled inference or connect the plugin to real WhatsApp groups from this repository environment. The user must confirm the OpenRouter cap and run the Gateway capture/delivery test on Linux before production use.
