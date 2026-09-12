# SECOND-SHIFT-CONTROL-GATEWAY-CG-003 — DURABLE ACTIVE-WORK STATE / NEXT-LEGAL-OPERATION IMPLEMENTATION + HOST QUALIFICATION

Status: **HOST QUALIFIED / DEVELOPMENT FROZEN / PRODUCTION GITHUB PUBLICATION NOT YET ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor CG-002: `887f1e49b0f7a6973de1be38b446e225b8abac39`  
Branch: `second-shift-control-gateway/cg-003-active-work-state`  
Qualified implementation subject: `d38825493805d0a9d4ac0f4ab17825badb59b6bb`  
Hosted qualification run: `34666596357`

## 1. Purpose and closure statement

CG-003 implements the first durable continuation primitive required by CG-002: a gateway-neutral `ActiveWorkPacket` whose current operation, exact predecessor, authority subject, repository/ref/effect scope, dependency standing, qualification standing, A-01 standing and `NEXT_LEGAL_OPERATION` can be reconstructed from durable state rather than guessed from conversational history.

CG-003 closes **local/reference durability and deterministic continuation semantics**. It does not yet claim that a production ChatGPT session can retrieve the packet from the final protected GitHub control-state installation. That GitHub publication/reconstruction bridge is the exact successor.

## 2. Implemented reference surface

New reference implementation:

- `control-gateway/src/active-work-state.js`
- `control-gateway/test/active-work-state.test.js`
- `control-gateway/test/mission-drift.test.js`
- `control-gateway/package.json`
- `.github/workflows/second-shift-control-gateway-cg-003.yml`

The implementation is intentionally gateway-neutral. It imports no System Master product/module topology and changes no A-01 routing or scheduler authority.

## 3. ActiveWorkPacket contract

Protocol: `control-gateway.active-work.v1`.

The packet binds:

- frozen mission version;
- workstream identity;
- monotonic authority epoch and optional receipt-backed authority rebind;
- exact authoritative subject (`sha1` or `sha256` SubjectRef);
- repository and branch/ref;
- allowed paths/effects;
- dependency graph version and receipt-to-operation edges;
- qualification state;
- GitHub admission state;
- A-01 state;
- current operation and exact predecessor receipt;
- last terminal receipt and receipt index;
- candidate successors;
- deterministic `next_legal_operation`.

Unknown fields, malformed subjects, unsafe path scopes, duplicate receipts/candidates, missing dependency graph edges and forged next-operation values fail closed.

## 4. Deterministic NEXT_LEGAL_OPERATION

The derived action is one of:

- `CONTINUE_CURRENT`
- `RECONCILE_CURRENT`
- `START_SUCCESSOR`
- `NO_LEGAL_SUCCESSOR`
- `AMBIGUOUS_SUCCESSORS`

A nonterminal operation remains current unless its qualification/GitHub/A-01 standing requires reconciliation. A terminal operation can start a successor only when exactly one candidate binds the exact terminal predecessor receipt and all declared receipt dependencies are satisfied.

Zero valid successors yields `NO_LEGAL_SUCCESSOR`. More than one yields `AMBIGUOUS_SUCCESSORS`. The controller never guesses between multiple legal-looking successors.

The stored `next_legal_operation` is not trusted as free-form state: it is re-derived and compared against the packet during validation.

## 5. Durable ActiveWorkStore contract

Reference durability uses Node `node:sqlite` with:

- WAL journal mode;
- `synchronous=FULL`;
- explicit busy timeout;
- one current head per workstream;
- append-only revision history;
- compare-and-swap on exact expected revision and SHA-256 packet-envelope digest;
- predecessor digest linkage between revisions;
- packet digest verification on read;
- history gap/fork detection;
- head/history-tail agreement checks;
- SQLite integrity checking.

Restart reconstructs the exact current packet and its deterministic next operation without requiring the prior ChatGPT conversation.

Concurrent/stale writers cannot both advance the same revision. Silent authority changes are rejected. Authority can change only through an explicit successful dependency-satisfying receipt-backed rebind with exactly one authority-epoch increment.

Protocol version, mission version and workstream identity are immutable inside one active-work history.

## 6. Transition rules

Current operation transitions are bounded:

- `ACTIVE -> BLOCKED`
- `BLOCKED -> ACTIVE`
- `ACTIVE|BLOCKED -> TERMINAL`

Terminalization requires one exact typed terminal receipt bound to the current operation. Successor candidates may be bound atomically with terminalization.

`startNextLegalOperation` works only when the deterministic action is `START_SUCCESSOR`; nonterminal, blocked, no-successor and ambiguous states cannot be coerced into a successor start.

## 7. Qualification and defect-repair lineage

Initial implementation subject:

`1494902611b995d9f59d58ce60055207e285de27`

Initial hosted run:

`34666516407`

Both Node jobs failed. The Node 24 evidence showed **41 tests / 38 pass / 3 fail**. All three failures exposed one schema-boundary defect: the identifier regular expression accidentally required at least two characters, so one-character adversarial test identities were rejected before the intended forged-next-operation, ambiguity and deterministic-ordering checks could execute.

The failing tests were not weakened or removed.

Repair subject:

`6be04b27239c3e02a4b9a53b95e5996e7c2b454a`

The repair:

1. corrected the identifier contract to permit valid one-character identifiers; and
2. strengthened durable history by making protocol version, mission version and workstream identity immutable across same-workstream CAS revisions.

A dedicated mission-drift regression was then added, producing final qualification subject:

`d38825493805d0a9d4ac0f4ab17825badb59b6bb`

Final hosted run `34666596357` on that exact subject:

- Node 22.23.2 — **42/42 PASS / 0 fail**
- Node 24.20.0 — **42/42 PASS / 0 fail**
- workflow conclusion — **SUCCESS**
- workflow token permissions — `contents: read`, `metadata: read`
- checkout/setup-node actions pinned to immutable commit SHAs.

The exact qualified implementation subject remains `d388254...`; this later governance-only freeze commit does not replace the qualification subject.

## 8. Development continuation packet

CG-003 now carries:

`governance/control-gateway/SECOND-SHIFT-CONTROL-GATEWAY-ACTIVE-WORK-PACKET.json`

Git blob SHA:

`d52a12977b896f30e58710d909a3285df2fadca7`

The packet records CG-003 as terminal with successful host qualification and binds exactly one successor: CG-004.

This packet is **development continuation authority only**. It exists so the control-gateway workstream has a concrete, machine-readable continuation contract immediately. It is not being misrepresented as the final production runtime control-state store; production requires protected durable GitHub publication and retrieval semantics.

## 9. Explicitly unchanged blockers

CG-003 does not repair the known A-01 route collision discovered in CG-002.

The repository still contains a direct self-hosted Second-Shift supervisor Windows stress workflow that current A-01 enforcement rejects and requires to be routed through `.github/workflows/a01-control-plane-gateway.yml`.

That enforcement must not be weakened or bypassed. The stress intent will later be exposed through a registered canonical A-01 adapter.

CG-003 also performs no scheduler cutover. A-01 SecondShiftSupervisorV2 remains the frozen future single live scheduling/execution owner, but the current legacy GitHub night scheduler is not modified by this operation.

## 10. What CG-003 proves — and what it does not

CG-003 proves on hosted Node 22 and 24 that the reference implementation can:

- preserve exact active-work identity durably;
- reject stale concurrent writers;
- detect packet/history tampering and forks;
- survive process restart and reconstruct current work without chat history;
- deterministically identify the one legal continuation or fail closed;
- reject silent subject/mission authority drift;
- accept only explicit receipt-backed authority rebinds.

CG-003 does **not** prove:

- production protected GitHub control-state publication;
- live GitHub App/ruleset authority for the ActiveWorkPacket;
- later-chat retrieval through a final reconstruction adapter;
- actual A-01 Windows qualification of the integrated gateway;
- A-01 supervisor cutover;
- production controller activation.

Those claims remain unavailable until their later gates pass.

## 11. Freeze rule

Later work may replace the SQLite reference storage adapter, but may not weaken these CG-003 invariants:

1. current work is reconstructed from durable state, never conversational inference;
2. exact predecessor identity is mandatory;
3. `NEXT_LEGAL_OPERATION` is deterministic and re-derived;
4. ambiguous successors fail closed;
5. stale writers lose compare-and-swap;
6. history is revisioned, content-bound and fork-detecting;
7. subject/repository/ref/effect authority cannot silently drift;
8. mission/protocol/workstream identity cannot mutate inside one history;
9. authority rebind requires explicit durable receipt evidence;
10. no CG-003 mechanism grants A-01 scheduling, worker, promotion or product authority.

Changing any invariant requires an explicit versioned reopening rather than an implementation shortcut.

## 12. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-004 — GITHUB DURABLE ACTIVE-WORK PUBLICATION / CHAT RECONSTRUCTION ADAPTER + HOST QUALIFICATION`

CG-004 must bridge the now-qualified packet/revision/CAS semantics into GitHub durable control-state publication and a deterministic reconstruction read path suitable for a later ChatGPT conversation. It must preserve the exact CG-003 packet semantics and must not make notifications, branch names or chat history authoritative.
