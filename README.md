# Ajudan

Ajudan locally collects observed WhatsApp messages from explicitly allowlisted groups and can send a private operations digest every three hours. It makes no model call when a message arrives. Raw messages stay in OpenClaw's local plugin state for a bounded period (30 days by default).

## Safety status

- Digest inference is **disabled by default** and remains disabled until you confirm a restrictive OpenRouter key budget/guardrail in the dashboard.
- Only these exact free model IDs are accepted: `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` and `openrouter/nvidia/nemotron-3.5-lightning:free`. There is no fallback.
- Digests go only to the configured private phone number. Never put a group ID in `recipient`.
- Collection uses OpenClaw's WhatsApp `message_received` hook, which runs only after WhatsApp admits a group message. The default mention gate drops unmentioned group messages before the hook.
- Group messages are untrusted data. Ajudan does not reply to them or follow instructions in them.

## Install on the Linux Gateway

Use OpenClaw `2026.10.10` and Node.js `24.22.1` or later. Copy this repository to a stable local directory on the Gateway, then update `plugins.load.paths` in `openclaw.example.json5` to that directory and merge the `plugins` section into your active config. Keep the plugin entry enabled but leave its `groupIds` empty. Run `openclaw config validate`, restart the Gateway, and confirm Ajudan appears in `openclaw plugins list`. Do not connect it to real groups yet.

Enable `channels.whatsapp.pluginHooks.messageReceived: true` as shown in the example. OpenClaw does not expose inbound WhatsApp messages to plugin `message_received` hooks unless this opt-in is enabled; only do this when you trust the installed plugins with group message content.

Configure both allowlists with the exact WhatsApp group JIDs:

1. Add the JIDs as keys under `channels.whatsapp.groups` (the channel's access policy), and set `requireMention: false` for each Ajudan group so unmentioned messages reach the hook. Preserve all other existing group settings.
2. Add the same JIDs to `plugins.entries.ajudan.config.groupIds` (the collector's independent allowlist).

For Ajudan groups, the plugin claims the admitted message before normal agent dispatch, so those messages are collected without invoking the normal agent model or replying in the group. Leave both allowlists empty to collect nothing. Never use `*`. Keep `inferenceEnabled: false` while testing. Set `recipient` to the private recipient's international phone number only after confirming the outbound adapter accepts the format on your host. The example has no real group or phone identifiers.

## Validate collection and private delivery

1. Create a temporary/test WhatsApp group and allowlist only that group in both places, with `requireMention: false` on that group.
2. Send harmless test messages, including a reply and a duplicate if practical. The Ajudan plugin must be loaded with conversation access and the WhatsApp `messageReceived` opt-in enabled. Check the plugin's local state via an approved local inspection method; do not print or share message bodies.
3. Restart the Gateway. Send another test message and verify capture resumes and duplicate delivery does not create another record.
4. Verify the source messages and timestamps are complete for the test window. The observation hook cannot recover messages it did not receive.
5. Confirm a private delivery to the configured recipient using a harmless test. Confirm no group receives a digest.
6. Set a restrictive OpenRouter key spending cap/guardrail in the dashboard and verify it is active. Do not run a paid-model probe. Only then set `inferenceEnabled: true` and restart; the plugin schedules the first digest after three hours and then every three hours.

To stop collection, remove the Ajudan plugin entry or set its `groupIds` to `[]`, then restart the Gateway. To stop inference while continuing collection, set `inferenceEnabled` to `false`. The plugin retains collected data only in local bounded state; remove the plugin's state through OpenClaw's supported plugin-state management if you need to erase it sooner.

## Development checks

From `openclaw-plugin/`, run `npm test` with Node.js 22 or later. The runtime itself requires Node.js 24.22.1 or later. This workspace cannot validate a live Linux Gateway, WhatsApp capture completeness, OpenRouter guardrail, or private delivery.
