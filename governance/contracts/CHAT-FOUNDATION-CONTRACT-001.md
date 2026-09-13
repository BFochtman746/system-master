# CHAT - Foundation Contract 001

**Capability** `C04` - **Owner** `SYSTEM_MASTER/CORE` - **Lane** CORE - **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Foundation implementation** `CHAT-FOUNDATION-1.0`

> **Foundation 1.0 implementation accepted for deterministic local Chat turn-envelope artifacts only.** This foundation proves ordered local message normalization, authority binding, content addressing, and verification. It does not grant model execution, provider/network access, credentials, tool or connector execution, memory writes, durable conversation persistence, autonomous sending, publication, or any external side effect.

## Known from current authority

- C04 CHAT is owned by `SYSTEM_MASTER/CORE` in capability crosswalk 003 and is the primary System Master working surface.
- Chat may coordinate requests across peer systems, but coordination does not transfer semantic ownership or side-effect authority from those systems to CORE/Chat.
- P13 model routing/local inference is absorbed into C20 LOCALAI; C04 does not acquire model-runtime authority from that absorption.
- P14 connector action runtime is absorbed into C27 PLUGINS under CONNECTED_ACTIONS; C04 does not acquire connector/action authority.
- Historical CHAT-001A/SMR019 portable evidence remains background evidence only; Foundation 1.0 acceptance is bound to the implementation and qualification named below.

## 1. Contract / interface

Provide a headless deterministic compiler/verifier for a local Chat turn envelope:

- implementation: `tools/chat_turn_plan.py`
- build: `python3 tools/chat_turn_plan.py build <chat.json> <output>`
- verify: `python3 tools/chat_turn_plan.py verify <output>`
- input schema: `CHAT-TURN-SPEC-1.0`
- output: `chat-turn-plan.json`, schema `CHAT-TURN-PLAN-1.0`
- qualification: `python3 .github/scripts/chat-foundation-qualify.py`
- representative corpus: `qualification/chat/corpus/basic/chat.json`
- CI: `.github/workflows/chat-foundation-qualification.yml`

Foundation 1.0 accepts an ordered bounded message sequence using only `system`, `assistant`, and `user` roles. Every message has a unique identifier; at least one user message is required; the terminal message must be the current user request. The compiler preserves message order and content, binds the plan to current C04 ownership, emits a source digest plus plan digest, and performs no inference or side effect.

## 2. Ingress routes

- A caller supplies one local `CHAT-TURN-SPEC-1.0` JSON document to the `build` command.
- The compiler reads `governance/CURRENT-AUTHORITY.json` and its selected capability crosswalk only to bind current C04 ownership into the plan.
- `verify` accepts a previously emitted local Foundation plan directory.
- No live model/provider stream, account session, tool result, connector callback, memory mutation, remote conversation store, voice session, or external message transport is admitted by Foundation 1.0.

## 3. Egress routes

- `build` emits exactly one local `chat-turn-plan.json` artifact in a caller-selected new output directory.
- `verify` returns a local PASS/FAIL result without mutating the plan.
- qualification emits `qualification-output/chat-foundation-1.0.json`.
- No model response is generated; no tool is called; no connector is executed; no memory or durable conversation state is written; no message is autonomously sent; no network request or other external side effect occurs.

## 4. Persistence and canonical writer

`tools/chat_turn_plan.py` is the canonical writer for the Foundation 1.0 local Chat turn-plan artifact only. It refuses an existing output path, rejects symlink traversal for input/output paths, stages the completed plan in a sibling temporary directory, and promotes the new directory by filesystem rename. It never overwrites or deletes an existing caller artifact.

Production conversation state, memory, artifact indexes, and any remote Chat/session state are outside this writer boundary. Their canonical writers must be separately admitted under their owning systems/contracts before C04 may consume them as durable state.

## 5. Dependencies

- Python standard library only for the local compiler/verifier.
- `governance/CURRENT-AUTHORITY.json` for the authority pointer.
- the current authority-selected capability crosswalk for C04 ownership.
- CORE for C04 Chat/working-surface semantics.
- C20 LOCALAI or another separately admitted model runtime for future inference; not used by Foundation 1.0.
- C27 PLUGINS / CONNECTED_ACTIONS for future connector/action execution; not used by Foundation 1.0.
- Other peer systems may later supply owned artifacts or operations through admitted interfaces; Foundation 1.0 does not execute them.

The Foundation substrate has no package-manager, network, provider SDK, model, credential, account, connector, tool-runtime, remote-store, or native-device dependency.

## 6. Failure semantics

Fail closed on malformed JSON, unknown top-level or message fields, unsupported roles, invalid or duplicate identifiers, empty/oversized/control-character content, excessive message count or aggregate content, absence of a user message, a terminal message that is not the current user request, stale/incorrect C04 authority binding, symlink traversal, an existing output path, malformed hashes, schema drift, plan tampering, or any attempt to escalate a denied authority even if the plan is rehashed.

For the same normalized source and authority state, compilation is deterministic and produces byte-identical plan artifacts and the same SHA-256. This is local artifact idempotency only; Foundation 1.0 performs no inference, send, tool call, memory mutation, or provider operation for which external idempotency would be required.

## 7. Evidence target

The machine-readable evidence artifact is `qualification-output/chat-foundation-1.0.json`. CI preserves it as `chat-foundation-1.0-evidence`.

Required evidence includes source identity, representative corpus path, qualification command, plan SHA-256, plan-file SHA-256, deterministic repeat-compile result, tamper detection, current-authority binding, ordered-message preservation, terminal-current-user validation, and explicit denials for model execution, provider/network access, credentials, tool execution, connector execution, memory writes, conversation persistence, autonomous send, and external side effects.

A log line by itself is not acceptance evidence.

## 8. Acceptance target

Foundation 1.0 is accepted only when all of the following pass:

1. `python3 -m unittest tests.test_chat_turn_plan`
2. `python3 .github/scripts/chat-foundation-qualify.py`
3. Independent builds of the representative corpus produce byte-identical plans and the same plan SHA-256.
4. Verification detects ordinary tampering and rehashed authority escalation.
5. Unknown fields, invalid roles/identifiers, duplicate messages, invalid terminal-role semantics, oversized content, symlinked input/output ancestors, and existing output paths fail closed.
6. The CLI exposes no model run/execute, send, connect/login, tool, memory, persist, or publish command.
7. The emitted plan denies model execution, provider/network, credential, tool/connector, memory-write, conversation-persistence, autonomous-send, and external-side-effect authority.
8. `.github/workflows/chat-foundation-qualification.yml` runs tests and qualification, verifies the committed Foundation census against the generator, and preserves machine-readable evidence.

Passing Foundation 1.0 closes the deterministic local Chat turn-envelope substrate gap for C04. It does not prove the full Chat product, model inference, production UI, streaming, multimodal handling, memory, tool execution, external actions, or production persistence.

## 9. Authority boundary

C04/CORE may define and validate Chat working-surface and local turn-envelope semantics inside the admitted owner boundary. The Foundation compiler may create and verify local plan artifacts only.

Model/runtime authority remains separately owned/admitted; P13 is absorbed into C20 LOCALAI. Connector/action execution remains separately owned/admitted; P14 is absorbed into C27 PLUGINS under CONNECTED_ACTIONS. Domain outputs remain owned by their peer systems. User authorization, credentials, external sends, durable memory/conversation writes, publication, and production side effects require explicit additional authority.

Chat orchestration is not ownership transfer: C04 may route intent to an owner, but it may not silently execute or persist on that owner's behalf.

## 10. Remaining gaps after Foundation 1.0

- Live model inference, model selection/routing, streaming response assembly, cancellation, retry, token/accounting semantics, and production latency evidence remain separate work.
- Durable conversation persistence, history retrieval, context-window construction, summarization/compaction, memory read/write semantics, and artifact linkage require separately admitted contracts and canonical writers.
- Tool calling, connector execution, user-confirmation gates, external messaging, and all side effects remain outside this substrate.
- Multimodal image/audio/video/file ingress, generated UI surfaces, native iOS interaction, accessibility behavior, and production Chat UX require separate qualification.
- Production privacy, security, abuse controls, retention, observability, recovery, and hosted/native acceptance evidence remain separate work.
