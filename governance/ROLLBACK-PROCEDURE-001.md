# Rollback Procedure — 001

**Effective** 2026-09-15 · **Owner** `SYSTEM_MASTER/CORE` · **Foundation requirement** P15

Evidence is append-only; code is not. This procedure safely backs out a bad control-plane
change without rewriting evidence, moving a content-addressed authority ref, or pretending
that in-flight P10/P11 lease state disappeared with Git history.

## Decide first: roll back, or halt and fix forward?

| Situation | Action |
|---|---|
| Control plane is dispatching wrong or unbounded work | **Kill new ingress immediately**, then roll back |
| A gate is failing but nothing is dispatching | Fix forward; do not hide a red gate with rollback |
| Governance pointer is broken / estate unreadable | Restore only the pointer (Scenario C) |
| A single delegation is wrong | Cancel through its owning control path; do not roll back the plane |
| You are not sure | **Kill new ingress.** The kill switch is reversible |

The P12 kill switch stops new ingress. It does **not** force-release work already holding a
lease; that separation protects writes already executing under a valid fence.

## Step 0 — Kill new ingress, always

On A-01, using the same state directory as the ingress service:

```powershell
$env:PYTHONPATH = "$PWD\control-gateway\python;$PWD"
python -m a01_github_ingress --state-dir C:\SystemMaster\a01-ingress --kill "rollback in progress: <reason>"
python -c "from pathlib import Path; p=Path(r'C:\SystemMaster\a01-ingress\NIGHT-HALT'); assert p.is_file(); print('P12_KILL_SWITCH=ENGAGED', p.read_text().strip())"
python -m a01_morning_receipt --db C:\SystemMaster\a01-supervisor.db --state-dir C:\SystemMaster\a01-ingress --json
```

Do not add a P12 `--status` compatibility path solely for rollback. The durable
`NIGHT-HALT` file is the status authority for this procedure.

## Step 1 — Capture the state before changing anything

```powershell
git rev-parse HEAD | Set-Content $env:TEMP\rollback-from.txt
git log --oneline -15
python -m a01_morning_receipt --db C:\SystemMaster\a01-supervisor.db --state-dir C:\SystemMaster\a01-ingress --json --out $env:TEMP\pre-rollback-receipt.json
node .github/scripts/system-brief.js --out $env:TEMP\pre-rollback-brief.md
```

Back up the live SQLite database with **SQLite's backup API**, not `copy`/`cp` of only the
main `.db` file while WAL pages may still be live:

```powershell
@'
import datetime, sqlite3
from pathlib import Path
src_path = Path(r"C:\SystemMaster\a01-supervisor.db").resolve()
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
dst_path = Path.home() / f"a01-supervisor-pre-rollback-{stamp}.db"
src = sqlite3.connect(src_path.as_uri() + "?mode=ro", uri=True)
dst = sqlite3.connect(dst_path)
try:
    src.backup(dst)
finally:
    dst.close(); src.close()
print(dst_path)
'@ | python -
```

The database snapshot matters because leases, fences, queue state and budget usage are not
reconstructed by reverting Git.

## Step 2 — Observe in-flight leases before rollback

```powershell
python -m a01_morning_receipt --db C:\SystemMaster\a01-supervisor.db --state-dir C:\SystemMaster\a01-ingress
```

Read **Still holding a lease**. Prefer natural completion/expiry and P10 recovery over any
manual intervention. P15 is diagnosis-only and exposes no force-release command. If an
emergency lease mutation is truly required, that is an owner-authorized P10/P11 operation
and must be recorded separately; do not invent it inside this procedure.

## Step 3 — Choose the rollback scenario

### Scenario A — Bad control-plane code

```powershell
git revert --no-commit <bad-sha>
node .github/scripts/validate-governance.js
node --test control-gateway
$env:PYTHONPATH = "$PWD\control-gateway\python;$PWD"
python tests/test_a01_github_ingress.py
python tests/test_a01_morning_receipt.py
git commit -m "revert: <bad-sha> — <reason>"
```

Use `git revert`, never force-push. Rewriting history breaks recorded exact-SHA and CAS
identity that must remain auditable.

### Scenario B — Bad governance content

Governance artifacts supersede; do not erase the defective historical version. Materialize
the prior good content as a new successor under the current schema/ID rules, repoint
`CURRENT-AUTHORITY.json`, then run governance validation. Preserve the bad version in Git
history as evidence that it existed and was detected.

### Scenario C — Broken authority pointer

Restore only the pointer from an exact known-good commit, then verify it immediately:

```powershell
git checkout <good-sha> -- governance/CURRENT-AUTHORITY.json
node .github/scripts/validate-governance.js
node .github/scripts/system-brief.js | Select-Object -First 8
```

### Scenario D — Bad content-addressed authority ref

**Never delete or move a CAS ref.** Write a successor authority object/ref that explicitly
supersedes the defective one and repoint its consumer. Deleting a supposedly write-once
ref destroys the property P04 exists to prove.

## Step 4 — Verify all five gates before resume

Do not resume until **all five verification gates** are green:

```powershell
# 1. Governance
node .github/scripts/validate-governance.js

# 2. Control Gateway / P12-P15 portable tests
node --test control-gateway
$env:PYTHONPATH = "$PWD\control-gateway\python;$PWD"
python tests/test_a01_github_ingress.py
python tests/test_a01_morning_receipt.py

# 3. Repository-wide canonical verification
bash ./verify.sh

# 4. Current authority projection
node .github/scripts/system-brief.js | Select-Object -First 8

# 5. Foundation projection
node .github/scripts/foundation-closure-matrix.js --summary
```

The expected authority ID and Foundation gap count must match the intended rollback target.
An unexpected count is an authority delta, not a cosmetic discrepancy.

## Step 5 — Resume P12 and inspect the first cycle

```powershell
$env:PYTHONPATH = "$PWD\control-gateway\python;$PWD"
python -m a01_ingress_service --check --db C:\SystemMaster\a01-supervisor.db --state-dir C:\SystemMaster\a01-ingress
python -m a01_github_ingress --state-dir C:\SystemMaster\a01-ingress --resume
python -m a01_ingress_service --once --db C:\SystemMaster\a01-supervisor.db --state-dir C:\SystemMaster\a01-ingress
```

Next morning, read the P15 receipt artifact before treating the rollback as operationally
healthy.

## Record the rollback

Append one entry to `governance/ROLLBACK-LOG-001.md`. Create the file only when the first
real rollback occurs; an empty synthetic log would fabricate history.

```markdown
## <date> — <scenario A/B/C/D>
From:      <sha>          To: <sha>
Reason:    <what went wrong, one line>
Killed at: <time>         Resumed at: <time>
Leases:    <completed/expired naturally | owner-authorized intervention and why>
Verified:  <all five gates and exact results>
Follow-up: <the gate that should have caught the problem, and whether it now does>
```

## Forbidden shortcuts

- Force-push the control plane.
- Delete or move a CAS authority ref.
- Rewrite or remove evidence.
- Force-release a lease through P15; P15 has no mutation authority.
- Resume P12 while any verification gate is red.
- Treat an empty/no-activity morning as proof the night succeeded.
