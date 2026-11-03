# Ajudan OpenClaw Collector Design

## Intent

Add the smallest usable Ajudan extension to the existing OpenClaw-based starter. It should collect messages locally from explicitly configured WhatsApp groups and produce a private operational digest every three hours, without invoking a model for each incoming message.

## Goals

- Accept messages only for an explicit group allowlist; deduplicate by stable message identity and preserve timestamps, sender, text, and reply context when available.
- Keep raw messages local with bounded retention.
- Summarize only on schedule, and deliver only to the configured private recipient.
- Fail closed unless the selected OpenRouter model is an exact approved `:free` model ID; never fall back to paid models or automatic routing.
- Avoid embeddings and any model calls during collection.
- Keep summary claims tied to source messages; do not invent owners, deadlines, or decisions.

## Non-goals

- No MCP interface, semantic search, embeddings, message reply behavior, or separate WhatsApp service.
- No deployment, WhatsApp pairing, API-key changes, or paid-model probe from this workspace.
- No guarantee of complete history until the collector is verified against the user's running Gateway.

## Constraints and risks

- Ajudan's repository is a starter; the OpenClaw runtime is installed on the user's Linux machine, with no runtime access or group IDs/recipient configured here.
- OpenClaw's `message:received` hook is observational/asynchronous and is not a durable audit trail. A local SQLite store can make successfully observed events durable, but cannot recover events the hook never supplies. The implementation and documentation must make that limitation explicit.
- OpenRouter key inspection previously showed a $50 key limit and no applied budget in the key endpoint. Automated inference must remain disabled until the user confirms a restrictive guardrail/credit limit in the dashboard.
- WhatsApp group messages are untrusted input and may contain sensitive content. Store locally, minimize model input, and do not let message instructions alter policy.

## Approaches considered

1. **OpenClaw plugin collector and scheduled digest (chosen):** reuse the configured WhatsApp Gateway and OpenClaw lifecycle. Smallest operational footprint; limited by whether the observational hook sees every relevant message.
2. **Standalone collector/service:** offers stronger control over storage and processing but duplicates WhatsApp integration and operations. Not chosen because the user selected OpenClaw and already installed it.
3. **Prompt-only scheduled agent:** smallest apparent setup, but does not provide a reliable cross-group history source and cannot guarantee that scheduled sessions see messages. Rejected.

## Proposed shape

- A small OpenClaw plugin observes inbound WhatsApp group events, checks the explicit configured group IDs, and appends valid events to durable local storage with an idempotent message key. Choose SQLite only if it is supported through the host's public plugin API without importing private internals.
- A scheduled plugin-owned job reads only messages in the requested interval, prepares a bounded chronological batch, calls OpenRouter once for the batch, and delivers the digest to the configured private recipient.
- Persist a digest/run record and only mark a batch complete after successful delivery, so transient model or delivery failures do not silently discard messages. Retries must not cause an unbounded loop or paid fallback.
- Configuration remains deny-by-default. Model ID is one exact approved `:free` identifier; if absent, invalid, unavailable, or rejected, record failure and send no model request to another model.
- Keep implementation aligned with the OpenClaw plugin API version installed on the Linux host; pin/verify compatibility before enabling.

## Acceptance checks

- Empty or malformed group allowlist captures nothing; unlisted groups are ignored.
- Duplicate event delivery creates one stored message; timestamps and source identities remain intact.
- Collection itself makes zero network/model calls beyond OpenClaw's event delivery.
- Scheduled dry-run reports the exact source interval and groups; failures leave messages eligible for retry.
- Only exact approved `:free` model IDs can reach the inference client; no auto-router or paid fallback.
- Private delivery target is mandatory; no digest is posted to a group.
- Linux Gateway test validates event payload shape and capture completeness with harmless sample messages before any real scheduled digest is enabled.

## Builder decisions

The implementation may choose the smallest database/API shape consistent with OpenClaw's supported plugin runtime. Retention duration, exact batch token limit, and whether to use a plugin scheduler or OpenClaw cron should be selected from supported APIs and documented; do not add a new external service or dependency without need.
