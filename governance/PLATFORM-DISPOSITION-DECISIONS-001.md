# Platform Disposition Decisions — 001

**Effective** 2026-09-13 · **Decided under delegated authority** · Amends the crosswalk to 002

Three platform requirements had no implementation: P03 evidence retention, P13 model
routing, P14 connector runtime. The owner delegated the disposition. Each is recorded
below with the evidence it rests on, because a delegated decision still owes the same
audit trail as a ratified one — more, if anything, since the owner was not in the room.

Two of these correct a defect in the crosswalk I authored. Saying so is cheaper than
leaving it.

---

## P03 Evidence retention — **BUILD**

### Decision
Build. Implemented as `control-gateway/python/a01_evidence_retention.py`, 17 tests.

### Why not defer
This is the only one of the three that is genuinely a System Master platform requirement,
and the failure mode is already latent. Evidence accumulates on A-01 every night with
nothing governing it. Two outcomes follow, pulling opposite ways: the disk fills until a
night dies for want of space, or someone clears it by hand and the audit trail has a hole
nobody can date. The second is worse and is the likelier one at 2am.

Deferring would also hollow out P04. Content-addressed authority writes guarantee a ref
means one thing forever; that guarantee is worth little if the evidence it points at is
removed by whoever needed disk space.

### Design, and the reasoning behind it
Current audit-log practice converges on one point: immutability is a property of the write
path, not of a policy sentence. Hash-linked records, where each entry carries a reference
to the previous one, make modification, deletion and insertion detectable; append-only
storage with restricted deletion is the enforcement, and policy language alone is not.

So:

- **Hash-chained append-only manifest.** Each entry carries the artifact digest and the
  previous entry digest. Replay detects any edit, removal or insertion. Opened `"a"`,
  never `"w"` or `"r+"`; the class has no update or delete method.
- **Record before delete.** An artifact is never removed until its `PRUNED` record is
  written and fsynced. If the record fails, the artifact stays. An untraceable deletion is
  the one outcome this module exists to make impossible.
- **Prune refused on a broken chain.** If verification fails, nothing is deleted, exit 2.
  A damaged manifest is an integrity problem, not a retention problem, and deleting into
  it would destroy the evidence needed to diagnose it.
- **Asymmetric retention.** Artifacts are prunable; manifest entries never are. Pruning an
  artifact is a space decision. Losing the record that it existed is an audit decision.
  Those are not the same decision and must not share a code path.
- **Tiered windows.** 30 days whole, then one artifact per day to 365, then prunable.
  `authority/`, `qualification/` and `closure/` prefixes are never prunable at any age.

### What I did not build
No S3 Object Lock or WORM storage. A-01 is a sovereign local box by standing rule and the
manuscript never leaves it. Hash-chaining gives tamper-*evidence* rather than
tamper-*proofing*: someone with local write access could rewrite the whole chain. That is
the honest limit of a local-only design, it is recorded here rather than glossed, and
closing it would need an external anchor — which is an owner decision about sovereignty,
not an engineering one.

---

## P13 Model routing and local inference — **ABSORB into C20 LOCALAI**

### Decision
Absorb. Not a System Master platform requirement. Model routing is owned by the LOCALAI
module (C20) under CORE.

### Why
**The System Master control plane performs no inference.** Not one workflow, script or
Python module in this repository calls a model. It dispatches qualifications, admits work,
schedules nights, and writes evidence. Inference happens in A-01's product surface, not in
its control plane.

Model routing is real and already decided: A-01 runs Lemonade Server on the Nimo box with
a verified OpenAI-compatible contract, under a standing doctrine of Lemonade primary and
never Ollama because of the gfx1151 silent-fallback bug. That is a live, working routing
layer with a hard-won configuration behind it.

Listing it as a System Master platform requirement would create a second owner for one
capability — the exact split-ownership defect the boundary rules exist to prevent, and the
same error the Owner Decision Pack spent seven decisions eliminating. I introduced it when
I derived P00–P15 from what the repo runs, and A-01's product layer is not what this repo
runs.

### Consequence
C20 LOCALAI's foundation contract must cover routing, model selection, fallback, and what
happens when a backend is unavailable. That contract is owed by CORE and is unchanged in
scope by this decision — it simply is not owed twice.

---

## P14 Connector action runtime — **ABSORB into C27 PLUGINS**

### Decision
Absorb. Not a System Master platform requirement. Governed by the existing boundary rule.

### Why
Same reasoning, and here the duplication is provable from the allocation itself. Boundary
rule in force since ratification: *"CORE owns the connector action runtime;
CONNECTED_ACTIONS owns module policy."* That rule already assigns both halves of this
capability. P14 added a third claimant to a boundary that had been deliberately drawn two
weeks earlier.

The control plane holds no connector runtime. It has GitHub API access in the ingress —
read-only, single-purpose, contracted under P12 — and nothing else.

### Consequence
C27 PLUGINS carries the module-policy contract; CORE carries the runtime within its own
foundation work. The standing constraint stands: no CONNECTED_ACTIONS module reaches
production authority before Foundation 1.0 closes.

---

## Effect on the census

| | Before | After |
|---|---:|---:|
| Platform requirements owed | 16 | 14 |
| Contracts owed | 51 | 49 |
| ACTIVE_GAP | 40 | 38 |
| EXPLICITLY_OUT_OF_SCOPE | 5 | 7 |

Completion stays at 16%. P03 is built and tested but its contract is written separately;
absorption removes work from this register without completing anything, which is why the
percentage does not move. A disposition decision that moved the completion number would be
a decision that had quietly counted something as done.

## What would reverse these

**P03** reverses if evidence retention turns out to belong to a product module rather than
the platform — unlikely, since the control plane is what writes the evidence.

**P13 and P14** reverse the moment the control plane performs inference or holds a
connector runtime of its own. If a future repair broker calls a model to adjudicate, P13
returns as a platform requirement and this decision should be superseded, not stretched.
