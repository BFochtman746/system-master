# REPO-MAP — what is where, and how to rebuild from it

Plain-language guide written 2026-09-25 for rebuilding on a fresh computer.
Covers two repositories: **BFochtman746/system-master** (this one, ~1,010 files)
and **BFochtman746/a01-coder** (32 files). Machine-level truth still lives in
`governance/CURRENT-AUTHORITY.json`; if this map and that file disagree, the
authority file wins and this map is stale.

Status words: **LIVE** = used today, keep. **SUPPORT** = needed by LIVE things.
**HISTORY** = frozen evidence, keep but never edit. **SUPERSEDED** = replaced by a
newer version, candidate for `governance/archive/superseded/`.

---

## 1. system-master — top level

| Path | Files | What it is | Status |
|---|---|---|---|
| `system-master/` | 204 | The actual Java product code (Maven). `f-wp-001` … `f-wp-012` are the twelve Foundation work packages; `foundation-spine/` (identity, contracts, keel, system-root) is the shared core; `learning-handler-binding-001/`, `book-system/`, `execution-driver/` are the first product slices. Builds to 567 classes. | LIVE |
| `pom.xml` | 1 | Root Maven build. `mvn -q -B compile` builds everything. | LIVE |
| `control-gateway/` | 82 | The A-01 control plane: Node `src/` (22 modules, all have tests in `test/`), Python `python/` (supervisor, ingress, execution worker, Run Now one-shot), `windows/` service scripts. This is what the self-hosted runner on A-01 executes. | LIVE |
| `.github/workflows/` | 77 | GitHub Actions. ~40 run on push/PR as quality gates; 5 are issue-triggered (incl. **Run Now**); a few are scheduled. Retired workflows are listed in `governance/archive/ACTIONS-WORKFLOW-RETIREMENT-2026-09-10.json`. | LIVE (needs thinning) |
| `.github/scripts/` | 94 | The qualification scripts the workflows run (`*-qualify.js/.py`, `*-selftest.js`) plus enforcement tools. | LIVE |
| `governance/` | 404 | Rules, contracts, registries, ledgers, audits, morning/second-shift handoffs. Only the files named in `CURRENT-AUTHORITY.json` are current; older numbered versions are superseded (see §4). | Mixed |
| `qualification/` | 97 | Fixtures and baselines for the qualify scripts (e.g. `document-truth/ratchet-baseline.json`). | SUPPORT |
| `tests/` | 23 | Python tests for control-gateway (Run Now, supervisor). | SUPPORT |
| `tools/` | 9 | Small Python planners (audiobook, automation, browser, calendar …). | SUPPORT |
| `verification/`, `verify.sh` | 4 | Local verify entry. | SUPPORT |
| `learning/`, `docs/`, `transport/`, `execution/` | 6 | Small stubs. | Review |
| `CURRENT-STATE.md` | 1 | Session entry point derived from the authority. | LIVE |
| `SYSTEM-MAP.md`, `SYSTEMS.md` | 2 | Ownership map of the nine product peers (Core, Learning, Book, Documents, Spreadsheet/Data, Media, Connected Actions, Research/Knowledge, Programming). | LIVE |
| `STANDARDS.md`, `LESSONS.md` | 2 | Engineering rules and lessons learned. | LIVE |
| `BRANCH-INVENTORY.md` | 1 | Older 503-branch sweep. Superseded by `cleanup/BRANCH-MANIFEST-2026-09-25.tsv`. | SUPERSEDED |
| `cleanup/` | new | This cleanup: branch manifest, restore script, work backlog. | LIVE |

### How the pieces depend on each other

```
GitHub push/PR ──> .github/workflows ──> .github/scripts (qualify) ──> qualification/ fixtures
                                   └──> mvn compile of system-master/
Owner opens issue "[CONTROL-GATEWAY-A01-RUN-NOW] ..." ──> run-now workflow
      ──> self-hosted Windows runner on A-01 ──> control-gateway/python ──> Lemonade (local LLMs)
governance/CURRENT-AUTHORITY.json ──> names the current topology, registries, contracts
```

## 2. a01-coder — the local repair loop (separate repo)

| Path | What it is |
|---|---|
| `src/indexer.mjs`, `retrieve.mjs` | Build/search the code index (4096-dim embeddings from Lemonade). |
| `src/repair.mjs`, `job.mjs`, `client.mjs` | Ask the model for a SEARCH/REPLACE patch, apply it, run the oracle test, restore on failure. |
| `src/doctor.mjs`, `config.mjs`, `config/endpoint.json` | Preflight check and endpoint/model config. |
| `run-batch.ps1`, `targets.txt` | Unattended batch: one repair target per line. |
| `test/*.mjs`, `test/qualify.mjs` | 13 offline proof files; `qualify.mjs` enforces the floor (664 at last run). |
| `WORK-ORDER.md`, `HANDOFF.md` | How to operate it and where it stands. |
| `tools/a01.ps1`, `.github/workflows/coder-job.yml` | Phone/Actions entry points. |

Proven: two small repairs of pure Node functions (with `gpt-oss-120b-MXFP4`).
Not proven: anything broader. Last 30B batch fixed 0 of 3.

## 3. Rebuild on a fresh computer — order

1. Install: Git, Java 17+ JDK, Maven, Node 22+, Python 3.11+, PowerShell 5.1 (built in), Tailscale.
2. Install **Lemonade Server**; pull models: `gpt-oss-120b-MXFP4` (repair), `Qwen3-Coder-30B-A3B-Instruct-GGUF` (fast, weaker), the embedding model (4096-dim) and reranker used by `a01-coder`. Serve on port `13305`; clients append `/api/v1`.
3. Join Tailscale so the phone can reach the box (old address was `100.92.116.70`).
4. `git clone` both repos. In `system-master`: `mvn -q -B compile` (expect 567 classes).
5. In `a01-coder`: `npm install` if needed, `node test/qualify.mjs` (must pass the floor), `node src/indexer.mjs` to rebuild the index, then `node src/doctor.mjs` (`can_repair=true`).
6. Register the GitHub self-hosted runner (labels `self-hosted, Windows, X64`) for `system-master`.
7. Re-create the secrets/variables below, then open a test Run Now issue.

### Secrets and settings you must re-supply (names only)

| Name | Where |
|---|---|
| `CONTROL_GATEWAY_WRITER_PRIVATE_KEY` | GitHub repo secret (GitHub App key for the writer bot) |
| `CONTROL_GATEWAY_WRITER_CLIENT_ID` | GitHub repo variable |
| `CONTROL_GATEWAY_WRITER_APP_SLUG` | GitHub repo variable |
| Self-hosted runner registration token | GitHub → Settings → Actions → Runners |
| `A01_SUPERVISOR_DB` | Machine env var; defaults to `C:\SystemMaster\a01-supervisor.db` |
| Lemonade endpoint + model names | `a01-coder/config/endpoint.json` |
| Tailscale login | Tailscale app |

## 4. Superseded material (sorting)

- `governance/archive/superseded/` already holds 26 older registries/topologies/baselines.
- Still at `governance/` root with several numbered versions: `WORK-OBLIGATION-REGISTRY` (7), `EXPECTATION-REGISTRY` (4), `SYSTEM-STATE-BASELINE` (3), `REALLOCATION-LEDGER` (3), `SYSTEM-TOPOLOGY` (2), `SYSTEM-COMPLETION-STATUS` (2), `COMPLETION-LEDGER` (2). Only the version named in `CURRENT-AUTHORITY.json` is current. Moving the rest is queued in `cleanup/BACKLOG.md` because the document-truth ratchet checks paths, so each move must update references in the same commit.

## 5. Branches

See `cleanup/BRANCH-MANIFEST-2026-09-25.tsv` (every branch, its commit, and what was done).
Archived branches live on as tags `archive/<branch>`. Restore any one with
`.\cleanup\restore-branch.ps1 -Branch <name>`.
