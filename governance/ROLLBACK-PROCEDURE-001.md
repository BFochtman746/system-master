# Rollback Procedure — 001

**Effective** 2026-09-15 · **Owner** `SYSTEM_MASTER/CORE` · **Foundation requirement** P15

Evidence is append-only, but defective control-plane code may need to move backward by an auditable Git revert. This procedure preserves that distinction while respecting live Second Shift leases, fencing tokens, queue identity, and P12's admitted ingress boundary.

## Decide first: roll back, or halt and fix forward?

| Situation | Action |
|---|---|
| Control plane is dispatching wrong or unbounded work | **Halt immediately**, then roll back |
| A gate is failing but nothing is dispatching | Fix forward; do not hide a valid red gate |
| Governance pointer is broken and the estate is unreadable | **Roll back the pointer only** (Scenario C) |
| A single module's work is wrong | Cancel that delegation; do not roll back the plane |
| You are not sure | **Halt**; halting is reversible |

## Step 0 — Halt new ingress before anything else

Use the current P12 kill-switch interface. Do not invent a second stop authority.

```bash
export SUPERVISOR_DB="<authoritative A-01 supervisor sqlite path>"
export INGRESS_STATE_DIR="<authoritative A-01 ingress state directory>"
python -m a01_github_ingress --state-dir "$INGRESS_STATE_DIR" --kill "rollback in progress: <reason>"
python -m a01_morning_receipt --db "$SUPERVISOR_DB" --state-dir "$INGRESS_STATE_DIR" --json
```

The morning receipt must show `kill_switch.engaged=true`. If the supervisor database cannot be read, the receipt exits 2; **unreadable must never be treated as clean**.

Halting prevents new P12 transport. Work already holding a P10/P11 lease is not killed mid-write.

## Step 1 — Capture the state you are about to change

```bash
git rev-parse HEAD > /tmp/rollback-from.txt
git log --oneline -15
cp "$SUPERVISOR_DB" /tmp/supervisor-$(date +%Y%m%d-%H%M).sqlite
python -m a01_morning_receipt --db "$SUPERVISOR_DB" --state-dir "$INGRESS_STATE_DIR" --json --out /tmp/pre-rollback-receipt.json
node .github/scripts/system-brief.js --out /tmp/pre-rollback-brief.md
```

The database copy is mandatory evidence because lease/fence/dispatch state is not reconstructable from Git alone.

## Step 2 — Let in-flight leases finish or expire

```bash
python -m a01_morning_receipt --db "$SUPERVISOR_DB" --state-dir "$INGRESS_STATE_DIR" | sed -n '/Still holding a lease/,/^$/p'
```

Prefer natural completion or expiry. P10 recovery and fencing exist to reject stale workers safely. Force-release only under separate explicit owner authority and record exactly which lease was affected and why.

## Step 3 — Choose the rollback scenario

### Scenario A — Bad control-plane code

```bash
git revert --no-commit <bad-sha>
node .github/scripts/validate-governance.js
cd control-gateway && node --test
cd python && python -m unittest ../../tests/test_a01_github_ingress.py ../../tests/test_a01_morning_receipt.py
cd ../.. && git commit -m "revert: <bad-sha> — <reason>"
```

Revert; never force-push. Rewriting history breaks CAS refs, evidence pointers, receipt subjects, and recorded commit digests.

### Scenario B — Bad governance content

Do not erase the defective governance version. Publish a successor that restores the previous semantics, point `CURRENT-AUTHORITY.json` to that successor, and run governance validation. Historical defective bytes remain provenance.

### Scenario C — Broken authority pointer

Restore only the pointer from a known-good commit, then validate it:

```bash
git checkout <good-sha> -- governance/CURRENT-AUTHORITY.json
node .github/scripts/validate-governance.js
node .github/scripts/system-brief.js | head -8
```

### Scenario D — Bad content-addressed authority ref

**Never delete or move a CAS ref.** Write a successor ref recording supersession and repoint the consumer. Ref deletion requires an explicit owner decision because it destroys the write-once audit guarantee.

## Step 4 — Verify before resuming

All five checks must be green:

```bash
node .github/scripts/validate-governance.js
cd control-gateway && node --test
cd python && python -m unittest ../../tests/test_a01_github_ingress.py ../../tests/test_a01_morning_receipt.py
cd ../.. && node .github/scripts/system-brief.js | head -8
node .github/scripts/foundation-closure-matrix.js --summary
```

An unexpected authority id, test failure, or Foundation gap count means the rollback is not complete. Do not resume.

## Step 5 — Resume and observe the first night

```bash
python -m a01_ingress_service --check
python -m a01_github_ingress --state-dir "$INGRESS_STATE_DIR" --resume
python -m a01_ingress_service --once --dry-run
```

The next morning, read the receipt before accepting the rollback as operationally healthy.

## Record every rollback

Append one entry to `governance/ROLLBACK-LOG-001.md` when a rollback actually occurs:

```text
## <date> — <scenario A/B/C/D>
From:      <sha>          To: <sha>
Reason:    <what went wrong, one line>
Halted at: <time>         Resumed at: <time>
Leases:    <expired naturally | force-released: which and why>
Verified:  <which of the five checks passed>
Follow-up: <the gate that should have caught this, and whether it now does>
```

`ROLLBACK-LOG-001.md` is intentionally event-created; the absence of a log before the first rollback does not fabricate a rollback event.

## Forbidden rollback shortcuts

- No force-push of the control plane.
- No deletion or movement of a CAS authority ref.
- No rollback or deletion of evidence; supersede it instead.
- No resumption while any of the five verification checks is red.
- No local construction of P12 admission authority as part of rollback recovery.
