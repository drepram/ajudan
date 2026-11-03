# Ajudan Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an OpenClaw starter named ajudan for allowlisted WhatsApp groups and operations summaries every three hours.

**Architecture:** Use OpenClaw for WhatsApp connectivity, scheduling, and model calls. Provide a minimal config template and agent instructions; no custom message database or service in this starter.

**Tech Stack:** OpenClaw, WhatsApp Web channel, an OpenRouter-compatible model endpoint (optional).

**Spec:** User request in session; the user opted out of further requirements discussion and asked to proceed.

## Global Constraints
- Name the project ajudan.
- Summaries recur every 3 hours and emphasize blockers, unanswered requests, decisions, and action owners.
- Do not include or reuse the friend's numbers, group IDs, tokens, or absolute paths.
- Admit only explicit WhatsApp group IDs; no wildcard group access.
- Do not reply to ordinary group messages.

## Review Focus
- Empty group list must not silently admit all groups: keep configuration deny-by-default.
- Routine group messages must not prompt public bot replies: document and configure quiet collection.
- Missing credentials/group IDs prevent live setup: provide clear safe placeholders, not pretend the bot is deployed.

---

### Task 1: Ajudan configuration and usage guide

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `openclaw.example.json5`
- Create: `.gitignore`

- [ ] Document OpenClaw vs OpenRouter, prerequisites, setup, WhatsApp pairing, group-ID allowlisting, and scheduled summary configuration.
- [ ] Provide a config template with an empty group allowlist and no friend-specific data.
- [ ] Define Ajudan's operations-summary priorities and quiet behavior in agent instructions.
- [ ] Verify the example config parses as JSON5 and scan files for accidental secrets or reference-project identifiers.
