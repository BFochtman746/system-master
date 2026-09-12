# SECOND-SHIFT-CONTROL-GATEWAY-CG-004 — GITHUB DURABLE ACTIVE-WORK PUBLICATION / CHAT RECONSTRUCTION ADAPTER + HOST QUALIFICATION

Status: **HOST QUALIFIED / LIVE DEVELOPMENT GITHUB RECONSTRUCTION QUALIFIED / DEVELOPMENT FROZEN / PRODUCTION ADMISSION NOT ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor freeze: `912b62fc49db0ac549cc3a06768659acd41d2a0d`  
Code branch: `second-shift-control-gateway/cg-004-github-publication`  
Exact qualified implementation subject: `59ed4c2857f0af35e339c2378956b110bf078119`  
Final qualification run: `34667378000`  
Development state ref: `control-gateway-state/active-work/second-shift-control-gateway-dev`  
Development state head: `e71d19360562c2f6e5d40c9d1b87fc9bca80e47b`

## 1. Closure statement

CG-004 closes the development GitHub publication and later-chat reconstruction layer for the CG-003 ActiveWorkPacket. A fresh process can resolve the dedicated GitHub state ref, validate the publication envelope and ActiveWorkPacket, verify immutable revision mirrors and the Git parent/digest history, confirm the ref did not move during reconstruction, and recover the exact current operation and deterministic `NEXT_LEGAL_OPERATION` without conversational history.

The GitHub ref is a locator, not authority. Authority is the verified packet and its mission/workstream/predecessor/content bindings. Branch names, notifications, wake hints and chat memory remain non-authoritative.

CG-004 does not activate production GitHub mutation admission, A-01 admission, or the A-01 scheduler.

## 2. Implemented surface

CG-004 adds:

- `control-gateway/src/github-active-work-publication.js`
- `control-gateway/test/github-active-work-publication.test.js`
- `control-gateway/test/live-github-reconstruction.test.js`
- `.github/workflows/second-shift-control-gateway-cg-004.yml`

Primary components:

- `GitHubActiveWorkPublisher`
- `GitHubChatReconstructionAdapter`
- `GitHubActiveWorkRestTransport`

Publication protocol:

`control-gateway.github-active-work-publication.v1`

## 3. Publication invariants

Each publication binds:

- frozen mission version;
- exact workstream;
- monotonic publication revision;
- exact predecessor Git commit SHA;
- predecessor packet digest;
- predecessor publication digest;
- canonical packet SHA-256 digest;
- validated CG-003 ActiveWorkPacket;
- publication-envelope SHA-256 digest.

Each revision writes identical bytes to:

- `control-gateway-state/active-work/head.json`; and
- immutable `control-gateway-state/active-work/revisions/<revision>-<packet-digest>.json`.

The publication commit must have exactly one Git parent equal to `predecessor_commit_sha`. The head and immutable revision mirror must agree exactly. History verification walks backward and rejects revision gaps, packet-digest forks, publication-digest forks, missing predecessor publications, missing revision mirrors and invalid genesis state.

## 4. Concurrent/stale mutation behavior

A publication write requires caller-supplied exact expectations for:

- current GitHub state-ref commit;
- current publication revision; and
- current packet digest.

The final ref update is fast-forward only (`force=false`). Stale expectations fail closed. Re-publishing the identical packet is idempotent and creates no new semantic state revision.

If GitHub network status becomes ambiguous during ref update, the publisher does not blindly retry. It re-reads the state ref and accepts success only when the ref equals the exact commit just created; otherwise the ambiguity remains a hard failure.

## 5. Chat reconstruction behavior

`GitHubChatReconstructionAdapter` accepts no prior-chat state. It reconstructs from verified GitHub publication state and returns the publication identity, mission/workstream, authoritative subject, repository/ref, current operation, qualification/GitHub/A-01 standing, and deterministic `NEXT_LEGAL_OPERATION`.

Reconstruction reads the state ref before and after full validation. Movement during the read fails with `PUBLICATION_HEAD_MOVED` rather than accepting a mixed snapshot.

A forged stored `NEXT_LEGAL_OPERATION` cannot be made authoritative merely by recomputing publication digests because CG-003 re-derives and validates the legal operation from the packet itself.

## 6. Host qualification

Initial exact subject:

`a8be47a30abf5ffea1c81a50a5f47eb28e2175c8`

Initial hosted run:

`34667280696`

The initial publication/reconstruction suite passed on Node 22 and Node 24. Node 22 reported **62/62 PASS / 0 fail**.

CG-004 then published an actual development state revision in GitHub and added a live remote reconstruction test. This produced the final exact qualified implementation subject:

`59ed4c2857f0af35e339c2378956b110bf078119`

Final run:

`34667378000`

Results on the exact final subject:

- Node 22.23.2 — **63/63 PASS / 0 fail**;
- Node 24.20.0 — **63/63 PASS / 0 fail**;
- workflow conclusion — **SUCCESS**;
- workflow permissions — `contents: read`, `metadata: read`;
- the live GitHub reconstruction test passed on both matrix jobs;
- the test reconstructed the actual dedicated GitHub state ref through `GitHubActiveWorkRestTransport` and `GitHubChatReconstructionAdapter`, without prior chat state.

The exact qualified implementation subject remains `59ed4c...`; this later governance-only freeze commit does not replace that qualification subject.

## 7. Real GitHub development publication evidence

Development state ref:

`control-gateway-state/active-work/second-shift-control-gateway-dev`

Revision 1 commit:

`b214018761dd7d444352252f36a006b95cb105a1`

Revision 1 parent:

`a8be47a30abf5ffea1c81a50a5f47eb28e2175c8`

Revision 1 packet digest:

`b4f94d9ee6dd3fc8696d2c47446c99428d16bad9d52e28d9b4b5e23f8a5f3a21`

Revision 1 publication digest:

`b847dad10fab1b4d595802d1d2684d4e382e2ad7062c996ec9a2e53e701084fd`

After final live qualification, the state was advanced by fast-forward to revision 2:

`e71d19360562c2f6e5d40c9d1b87fc9bca80e47b`

Revision 2 parent:

`b214018761dd7d444352252f36a006b95cb105a1`

Revision 2 packet digest:

`3c05d7fc1b5b16553b782f7aba33e8be87bb5d295c94d681cd1df3f6f6ef7d52`

Revision 2 publication digest:

`fe975b0192ce561f3405d8ddac89e2b129738d00101fbeaf6e60b09c993e0b4e`

Revision 2 `head.json` and immutable revision file both resolve to Git blob:

`39c4ff174a5d0e0866164cdf089268ea7f3a40af`

Revision 2 binds the final qualified code subject `59ed4c...`, marks CG-004 terminal/PASSED and records exactly one legal successor: CG-005.

This state ref is explicitly **development authority**, not production activation. Protection/ruleset enforcement and production mutation admission remain later gates.

## 8. Failure tests closed by CG-004

The qualified suite covers, at minimum:

- initial publication;
- multi-revision parent/digest history;
- identical-write idempotency;
- stale expected head conflict;
- packet tampering;
- forged stored next-operation state;
- missing immutable revision mirror;
- Git commit parent mismatch;
- predecessor packet-history fork;
- mission/workstream mismatch;
- ref movement during reconstruction;
- ambiguous network success after ref update;
- ambiguous network failure before observed update;
- public/read-only REST reconstruction without invented credentials;
- authenticated fast-forward REST publication semantics;
- absent GitHub content handling;
- network uncertainty classification;
- live reconstruction from the real GitHub development state ref.

## 9. Explicit non-claims and open blocker

CG-004 does **not** prove or activate:

- production GitHub mutation admission;
- protected production state-ref/ruleset ownership;
- A-01 admission;
- A-01 Windows qualification;
- A-01 scheduler cutover;
- production controller activation.

The pre-existing A-01 enforcement collision remains unchanged: `.github/workflows/second-shift-supervisor-v2-a01-windows-stress.yml` is an unregistered direct self-hosted path and current enforcement requires `.github/workflows/a01-control-plane-gateway.yml`. CG-004 does not weaken or bypass that enforcement.

## 10. Freeze invariants

Later implementation may change transport/storage details but may not weaken these rules without explicit versioned reopening:

1. chat memory is never state authority;
2. a GitHub ref is a locator, not authority by itself;
3. packet mission/workstream and deterministic next-operation validation are mandatory;
4. every publication is predecessor-bound and content-digested;
5. each published revision has an immutable mirror;
6. stale/ref-raced publication fails closed;
7. network ambiguity is resolved by exact reread, not blind retry;
8. reconstruction verifies a stable snapshot before returning continuation state;
9. publication does not grant GitHub mutation or A-01 execution authority by itself;
10. production claims require later admission, protection and A-01 gates.

## 11. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-005 — GITHUB MUTATION ADMISSION / REPOSITORY-BRANCH-PATH-PREDECESSOR GATE + HOST QUALIFICATION`

CG-005 must make every proposed GitHub state-changing operation prove repository, branch/ref, allowed path/effect, exact predecessor, workstream/mission authority and validation standing before a mutation is admitted. It must consume CG-004 reconstructed state rather than conversational assumptions.
