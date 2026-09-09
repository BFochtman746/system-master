# CHAT-001A / SMR019 — Cumulative Assembly 003

Status: LOCAL EXACT CUMULATIVE CANDIDATE / FULL PORTABLE PASS / GITHUB-NATIVE RUNNABLE SOURCE STILL REQUIRED
Date: 2026-09-09
Packet: `SYSTEM-MASTER-REBUILD-019`
Authority: `CHAT-001A`

## Purpose

This assembly closes the dependency-staleness defect recorded by `CHAT001A-RECONCILIATION-002.md`.

The prior CHAT-only corrected subject `5c9f5a73855ae9a154ac4ffca6dd57d167fca80e0b3bc55d55a24c180b19eaca` correctly repaired CHAT-001A `STREAM_CHECKPOINT` versus `FINAL`, but it was based on historical SMR018 bytes. It therefore could not be dependency-current after PLATFORM-005 reconciliation.

The current assembly preserves that CHAT repair and rebases the packet onto the exact dependency-valid SMR018 PLATFORM-005 subject:

`cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`

## Exact identities

- historical SMR019 subject: `f4d5915275974c3d507fb3da0c6844ee21a660eddc40d47f03d867b7b2720727`
- prior CHAT-only corrected subject: `5c9f5a73855ae9a154ac4ffca6dd57d167fca80e0b3bc55d55a24c180b19eaca`
- final dependency-valid SMR018 predecessor: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`
- new cumulative SMR019 subject: `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`

No qualification result transfers across those identities.

## Cumulative predecessor surface

The SMR018 surface propagated into SMR019 includes:

- PWA navigation and session JSON-Schema fail-closed constraints;
- SMR018 packet projection-consumer, temporal-cache and route laws;
- application-shell browser projection temporal validation;
- fail-closed navigation rendering and `REAUTH_REQUIRED` projection handling;
- isolated service-worker cache generation plus cache-entry maximum-age enforcement;
- Java `OfflineShellPolicy`, `PwaSessionProjection` and `ShellRules` corrections;
- parsed-path `/api` / `/api/...` prohibition including `/api?view=shell`;
- PLATFORM-005 focused regression and portable contract/recurrence guards;
- cumulative contract-registry schema digest rebinding.

The CHAT-001A repair remains the previously qualified semantic distinction between non-final resumable `STREAM_CHECKPOINT` and canonical `FINAL` answer standing in Java and PostgreSQL/static contract qualification.

A focused local unified diff from the exact CHAT-only tree to this cumulative rebase was generated during qualification.

- local focused cumulative-diff SHA-256: `e0e904b870eda3c1e770116035c7e8a925cb841e290e90314216bbaabe288383`

This digest is local evidence metadata. The complete runnable source tree is not yet represented by an ordinary GitHub-native immutable source commit.

## Fresh exact-byte qualification

Exact cumulative source/test subject:

`9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`

Results:

- strict Java 21: PASS, 396 main + 19 test sources;
- all executable suites: 19/19 PASS;
- CHAT-001A focused: 150,079 PASS;
- PLATFORM-005 focused: 120,088 PASS;
- CHAT-001A contract parity: 8/8 PASS;
- CHAT-001A PostgreSQL static contract: 9 objects PASS;
- R023 recurrence: 14/14 reconstructed material areas PASS;
- PLATFORM-005 contract parity: 6/6 PASS;
- PLATFORM-005 persistence boundary: PASS, 0 PostgreSQL objects;
- R022 recurrence: 13/13 reconstructed material areas PASS;
- system coherence: PASS, zero warnings;
- engineering congruence: PASS, 33 authoritative concerns / 0 exceptions;
- exact-subject gate: PASS;
- release manifest: 1,054/1,054 PASS;
- release-manifest SHA-256: `6c07a3d119b235cc7ca9a8d12b9243b867de4c81d661f766bd34b5fee72ce6ae`;
- CURRENT-AUTHORITY SHA-256: `fbc2dcaa8c6691f7638f63f5211f55a5671dbc99ddaf612ed59197abe4781a74`.

## Boundary

This closes the local portable cumulative predecessor requirement. It does not establish GitHub-native runnable source custody, hosted exact-SHA qualification, A-01 Windows qualification, Apple-native behavior or production certification.

`PC-ENDGAME-026` remains deferred.

The packet-declared dependency-valid successor is `SYSTEM-MASTER-REBUILD-020 / OPERATOR-OPS-001`.