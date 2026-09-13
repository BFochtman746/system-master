# Rollback Procedure — 001

**Effective** 2026-09-13 · Covers P15 in the capability crosswalk proposal

Every repair path in this estate is forward-only. That is correct for *evidence* — you
never rewrite what happened. It is wrong for *code*, because it means a bad control-plane
commit can only be fixed by shipping another commit while the broken one is live.

This is the procedure for going backwards safely. The hard part is not `git revert`. It
is that a running night holds leases, fencing tokens, and a queue built against the
commit you are about to undo.

---

## Decide first: roll back, or halt and fix forward?

| Situation | Action |
|---|---|
| Control plane is dispatching wrong or unbounded work | **Halt immediately**, then roll back |
| A gate is failing but nothing is dispatching | Fix forward. Rolling back a red gate hides the finding |
| Governance pointer is broken, estate unreadable | **Roll back the pointer only** (Scenario C) |
| A single module's work is wrong | Cancel that delegation. Do not roll back the plane |
| You are not sure | **Halt.** Halting is always reversible and costs one night |

Halting is never the wrong first move. The kill switch exists so that the decision of
what to do next is made in the morning, awake, rather than at 2am.

---

## Step 0 — Halt, always, before anything else

```bash
python -m a01_github_ingress --halt "rollback in progress: <reason>"
python -m a01_github_ingress --status        # confirm halted: true
```

Nothing new is admitted. Work already claimed keeps running — that is deliberate, because
killing a worker mid-write is how you get the corrupt state you are trying to avoid.

## Step 1 — Capture the state you are about to change

Do this before touching anything. A rollback with no before-picture is not reversible.

```bash
git rev-parse HEAD > /tmp/rollback-from.txt
git log --oneline -15
cp control-gateway/state/supervisor.sqlite /tmp/supervisor-$(date +%Y%m%d-%H%M).sqlite
python -m a01_morning_receipt --json --out /tmp/pre-rollback-receipt.json
node .github/scripts/system-brief.js --out /tmp/pre-rollback-brief.md
```

The database copy is the important one. The supervisor holds lease state that git does
not, and it is the thing you cannot reconstruct.

## Step 2 — Let in-flight leases finish or expire

```bash
python -m a01_morning_receipt | sed -n '/Still holding a lease/,/^$/p'
```

If leases are open, prefer waiting for expiry over forcing release. The heartbeat SLA and
`recover()` in the supervisor exist precisely for this, and they are better at it than you
are at 2am. Force-release only when a lease blocks a rollback that cannot wait, and record
that you did.

## Step 3 — Choose the scenario

### Scenario A — Bad control-plane code (workflows, scripts, gateway)

```bash
git revert --no-commit <bad-sha>
node .github/scripts/validate-governance.js          # must PASS
cd control-gateway && node --test                    # must be 0 fail
cd python && python -m unittest test_a01_github_ingress test_a01_morning_receipt
cd ../.. && git commit -m "revert: <bad-sha> — <reason>"
```

Revert, never force-push. A forced history rewrite breaks every CAS ref, evidence pointer
and commit digest recorded against the old history — and those are your audit trail.

### Scenario B — Bad governance content (topology, allocation, obligations)

Do not revert the file. Governance artifacts supersede by successor, so roll *forward to a
copy of the previous content*:

```bash
git show <good-sha>:governance/SYSTEM-TOPOLOGY-006.json > governance/SYSTEM-TOPOLOGY-007.json
# edit: topology_id -> 007, effective_date -> today,
#       supersedes -> governance/SYSTEM-TOPOLOGY-006.json,
#       standing   -> note that this restores 005 content after a defect in 006
```

Then repoint `CURRENT-AUTHORITY.json` and validate. This keeps the defective version in
the record, which is the point of a supersession chain — a rollback that erases the
mistake also erases the evidence that you caught it.

### Scenario C — Broken authority pointer (fastest, most common)

The estate is unreadable but nothing is corrupt. Restore only the pointer:

```bash
git checkout <good-sha> -- governance/CURRENT-AUTHORITY.json
node .github/scripts/validate-governance.js
node .github/scripts/system-brief.js | head -8
```

### Scenario D — Bad authority ref written by the CAS bootstrap

**Never delete or move a CAS ref.** The bootstrap's whole guarantee is that a ref is
written once and never changes; deleting one to "clean up" destroys that guarantee
permanently and silently.

Write a successor ref recording the supersession, leave the bad ref in place, and repoint
the consumer. If you believe a ref must be deleted, that is an `owner` decision and it
needs writing down before it is executed.

## Step 4 — Verify before resuming

All five must pass. If any fails, you are not rolled back — you are somewhere new.

```bash
node .github/scripts/validate-governance.js                    # 4 PASS
cd control-gateway && node --test                              # 0 fail
cd python && python -m unittest test_a01_github_ingress test_a01_morning_receipt
cd ../.. && node .github/scripts/system-brief.js | head -8     # expected authority id
node .github/scripts/foundation-closure-matrix.js --summary    # gap count as expected
```

An unexpected gap count means governance changed in a way you did not intend. Stop and
find out why before resuming.

## Step 5 — Resume, and watch the first night

```bash
python -m a01_ingress_service --check
python -m a01_github_ingress --resume
python -m a01_ingress_service --once --dry-run     # confirm sane delegations
```

Next morning, read the receipt before anything else. A rollback that looks clean at the
console and produces a broken night is the common case, not the rare one.

---

## Record it

Append to `governance/ROLLBACK-LOG-001.md`, one entry per rollback:

```
## <date> — <scenario A/B/C/D>
From:      <sha>          To: <sha>
Reason:    <what went wrong, one line>
Halted at: <time>         Resumed at: <time>
Leases:    <expired naturally | force-released: which and why>
Verified:  <which of the five checks passed>
Follow-up: <the gate that should have caught this, and whether it now does>
```

The follow-up line is the one that earns its keep. A rollback that does not end in a new
or tightened gate will happen again in the same place.

## Things this procedure will not let you do

- **Force-push the control plane.** Breaks every recorded digest.
- **Delete a CAS authority ref.** Destroys the write-once guarantee permanently.
- **Roll back evidence.** Evidence is append-only. A wrong result is superseded, never
  removed.
- **Resume while any of the five checks is red.** Resuming into a red gate is how a
  rollback becomes an outage.
