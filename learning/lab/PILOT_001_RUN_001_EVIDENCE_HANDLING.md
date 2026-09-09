# PILOT-001-RUN-001 Evidence Handling Policy

Status: ACTIVE FOR LOCAL PILOT EXECUTION
Protocol: `PILOT-001-v1`
Scope: first real-participant Learning Lab pilot only

## Purpose

Define the technical storage, review, export, and integrity boundaries for a real `PILOT-001-RUN-001` participant record without expanding the participant data collected by the frozen pilot protocol.

This policy is an engineering/data-handling contract for the pilot. It is not a claim of population validity, psychometric validity, certification, job readiness, or legal/compliance certification.

## Local-by-default storage

The real-participant launcher MUST store pilot state in the configured local pilot state root outside the repository.

The participant launcher MUST NOT automatically:

- commit pilot evidence to Git;
- upload pilot evidence to GitHub Actions or repository artifacts;
- send pilot evidence to an external API;
- place participant state in the repository working tree;
- copy raw participant free text into any retained artifact.

The local pilot state may contain protocol-authorized pseudonymous evidence including identifiers, scored/routing evidence, integrity attestations, ordering timestamps, and SHA-256 response digests. It MUST NOT contain direct PII or raw participant free-text responses as pilot evidence.

## Local artifact classes

A completed valid closed-loop pilot may create the following local artifacts:

1. `<pilot_id>.manifest.json` — local pseudonymous execution manifest;
2. `<state_key>.sqlite3` — local Learning runtime/evidence database;
3. `<pilot_id>.completion.json` — digest-only adjudicated completion summary;
4. `<pilot_id>.handoff.json` — integrity envelope binding the completion package, manifest, and checkpointed SQLite snapshot by SHA-256;
5. `<pilot_id>.handoff.sha256` — convenience digest of the handoff envelope;
6. optional `<pilot_id>.review-intake.json` — minimized local review packet derived only after handoff verification.

The handoff hash files do not by themselves prevent malicious local rewrite. They become useful tamper-detection evidence only after the handoff digest is anchored in a separately controlled approved evidence record.

## Review intake minimization

A review-intake packet MUST be generated only after the full local handoff verifies.

The default review-intake packet may include:

- protocol and review-intake versions;
- pseudonymous pilot ID;
- domain key needed to interpret the learning task;
- participant outcome and effectiveness-review eligibility;
- baseline, independent-verification, retention, transfer, and observed-change metrics already present in the completion package;
- retention delay;
- record digest and handoff digest;
- explicit privacy/truth-boundary flags.

It MUST NOT include:

- participant key;
- learner ID;
- local state key;
- filesystem path;
- raw response text;
- free text;
- direct PII;
- the SQLite database body;
- the manifest body.

## Export and external anchoring

Local review-intake generation is NOT external-export authorization.

No tool in the participant execution path may automatically upload or transmit the pilot record, completion package, handoff envelope, SQLite database, manifest, or review-intake packet.

Any later external anchoring/export must be an explicit separate operation with:

1. an approved destination;
2. a defined purpose;
3. the minimum necessary artifact set;
4. preserved pseudonymization and no-raw-response/no-direct-PII gates;
5. provenance tying the external record to the handoff digest;
6. an explicit indication that external anchoring occurred.

Until such a destination/operation is separately approved and implemented, the authoritative human pilot evidence remains local.

## Retention and deletion truth boundary

This first-pilot tooling does not promise secure deletion from operating-system backups, filesystem snapshots, or copies outside its control.

Participant withdrawal terminates participation and excludes the record from effectiveness review under `PILOT-001-v1`; it does not silently fabricate a claim that all existing bytes have been securely erased.

The launcher therefore must not tell a participant that withdrawal guarantees secure deletion unless a separately qualified deletion capability exists.

## Human consent visibility

Before explicit consent, the participant-facing consent surface MUST state that:

- pilot evidence is stored locally on the pilot machine by default;
- the participant launcher does not automatically upload it to GitHub or another external service;
- the retained pilot record contains scored/routing evidence and response digests, not raw free-text answers or direct PII;
- any later external export/anchoring is a separate controlled operation, not implied by participation.

## Truth boundary

This policy can govern software behavior and artifact handling. It cannot prove a participant's identity, substitute for genuine consent, or make a local digest an externally anchored evidence record by declaration alone.
