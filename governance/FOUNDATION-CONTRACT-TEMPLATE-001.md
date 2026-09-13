# Foundation Contract Template — 001

**Effective** 2026-09-13 · Satisfies Foundation Closure Census 001 scope areas 3–10

The closure matrix reports 33 ACTIVE_GAPs, every one reading "owner registered, foundation
columns unpopulated." Those columns are unpopulated because no artifact carries them:
P6 answers *who owns this*, and the census asks *how does it route, who writes, how does
it fail, what proves it*. This is that artifact.

**One file per owned module**, at `governance/contracts/<MODULE_KEY>-FOUNDATION-CONTRACT-001.md`.
A module's matrix state cannot leave ACTIVE_GAP until its contract exists with all eight
gap-forcing sections populated. Writing "TBD" in a section leaves it unpopulated — the
census forbids inferring completion from planning volume, and a placeholder is planning
volume.

Order of work: the 8 modules under CORE and DOCUMENTS first, since they carry the
dependencies the other lanes consume.

---

## Template — copy below this line

```markdown
# <MODULE_KEY> — Foundation Contract 001

**Owner** <SYSTEM_MASTER/LANE> · **Effective** <YYYY-MM-DD>
**Authority** governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json

## 1. Contract / interface
What this module promises to callers. Named operations, their inputs and outputs, and
what is explicitly not offered. If another lane must call it, this is the only section
they should need to read.

## 2. Ingress routes
Every way work enters. Name the caller, the transport, and the authority that admits it.
A route with no named admitting authority is a gap, not a route.

## 3. Egress routes
Every way results leave — return values, emitted artifacts, notifications, side effects
on other modules. If this module can change another module's state, say so here.

## 4. Persistence and canonical writer
Exactly one component may write each piece of durable state. Name it, name the store,
and name what happens to a write that arrives from anywhere else. "Several things write
it" is the gap this section exists to surface.

## 5. Dependencies
Modules and shared infrastructure this one requires, and the direction of each. Note any
that cross a boundary rule in the allocation registry — those need owner sign-off, not
lane discretion.

## 6. Failure semantics
What happens when each ingress route fails, when a dependency is unavailable, and when a
write is refused. State whether failure is fail-closed or fail-open, and for anything
fail-open, why that is safe. Include the retry and idempotency rule: what makes two
identical requests one operation rather than two.

## 7. Evidence target
The artifact produced that proves this module did what it claimed — path, format, and
what must be in it. Evidence that is only a log line is not evidence.

## 8. Acceptance target
The exact command that returns PASS or FAIL, and the condition for PASS. Must be
runnable by someone who did not write the module. "Reviewed and looks correct" is not an
acceptance target.

## 9. Authority boundary
What this module may decide alone, and what requires the owner. Mirrors
governance/DECISION-RIGHTS-001.md, scoped to this module.

## 10. Open gaps
Anything in sections 1–9 not yet true. Each becomes an entry in the unresolved-gap
successor register. An empty section here, with all others populated, is what moves this
module to COMPLETE_WITH_EVIDENCE.
```

---

## Worked example — the shape to aim for

Not a proposal for FILE; an illustration of the level of specificity each section needs.
Sections 1–5 abbreviated.

> **4. Persistence and canonical writer**
> The artifact index at `control-gateway/state/artifacts.sqlite` is written only by
> `FileArtifactWriter`. No other component opens that database for write, including
> other DOCUMENTS modules. A write arriving from any other caller is rejected with
> `FILE_WRITER_AUTHORITY` and the attempt is recorded in the event log. Readers use the
> read-only connection helper; a read path that needs a write is a design defect, not a
> case to handle.
>
> **6. Failure semantics**
> Fail-closed throughout. Unavailable store → `FILE_STORE_UNAVAILABLE`, no partial write,
> caller retries. Digest mismatch on read → `FILE_DIGEST_MISMATCH`, the artifact is
> quarantined rather than returned, and the owner is notified; this never degrades to
> returning the bytes anyway. Idempotency is on the content digest: ingesting identical
> bytes twice yields one artifact and the second call returns the existing id. Retries
> are safe by construction and are not rate-limited.
>
> **8. Acceptance target**
> `cd control-gateway && node --test test/file-artifact-*.test.js`
> PASS when all cases pass with zero skips. The suite must include: rejected foreign
> write, quarantine on digest mismatch, and duplicate-ingest returning the same id.

## Why the acceptance target is the section that matters

Sections 1–5 describe intent, and intent is the thing this estate already has in
abundance. Section 8 is what converts a module from "designed" to "proven," and it is the
only section the closure matrix can ever verify mechanically. If you write only one
section per module in the first pass, write that one.
