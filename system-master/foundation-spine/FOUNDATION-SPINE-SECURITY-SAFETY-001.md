# FOUNDATION-SPINE-SECURITY-SAFETY-001

Status: CANONICAL SHARED SECURITY/AI-SAFETY DESIGN

## Trust model

No actor, worker, tool, connector, model, device or provider is trusted merely because it is local, internal, previously used or reachable. Identity, authorization, contract standing and current policy are checked at the relevant boundary.

## Least-authority execution

Executors receive short-lived, task-bounded capabilities. A worker cannot infer authority from possession of a plan. A model cannot infer permission from tool availability. A tool cannot infer effect permission from invocation eligibility.

## Delegation

Delegation is explicit, bounded, transitive only where allowed, expiry-bound and revocable. Child work cannot widen parent scope, rights, privacy purpose, budget, resource ceiling, deadline or effect privileges.

## Model/tool agency

Planning and language output are untrusted proposals until validated by deterministic contracts/policy where required. The system minimizes exposed tool functionality, exposed permissions and autonomous effect scope. Prompt/tool outputs cannot mint new capability grants.

## Prompt and indirect-injection defense

Retrieved content, files, webpages, tool responses and peer-agent messages are data, not authority. Instructions embedded in them are not promoted above the governing system/user policy. Sensitive actions require independent policy/effect authorization outside the model's text generation.

## Secrets and cryptography

Secrets/keys/certificates are stored by dedicated secret/key custody mechanisms and referenced by opaque identity/capability. They must not be copied into prompts, ordinary logs, artifacts or evidence payloads except where an explicitly redacted/derived proof is designed for that purpose.

Cryptographic verification is used where identity/integrity matters: artifact digests, provenance/attestation, signed releases/checkpoints where required and secure transport/provider verification.

## Privacy

Context assembly and data flows carry purpose, data classification, retention/deletion restrictions and provider/locality constraints. A route that violates a privacy constraint is ineligible regardless of performance score.

## Rights

Rights/licensing/attribution is a separate decision authority from privacy. Both may block the same operation for different reasons and their evidence must remain distinct.

## Supply chain

Software, workflow, model, dependency and build provenance must be digest/version bound. Release/promotion consumes supply-chain standing; it does not trust an artifact because it came from the project's own repository.

## AI safety

Model/agent risk tier, required evaluations, red-team results, autonomy ceiling, human-oversight requirement, behavior drift and safety-case standing are explicit. Model availability and model safety are separate. A healthy model/provider may still be disallowed by safety standing.

## Emergency control

A privileged operator can pause/fence/drain/quarantine or stop governed work through auditable controls. Emergency authority must be narrow, attributable and followed by reconciliation; it is not a permanent bypass.