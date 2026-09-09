# RECON-001C — GitHub Exact-Object Import Handoff

Status: `READY_FOR_CREDENTIALED_GIT_TRANSPORT`

Purpose: repair the remaining `SOURCE_CUSTODY_GAP` by transferring already-sealed Git objects into GitHub without changing their object identities.

Authoritative carrier: `UAF_FOUNDATION006_J.gitbundle`
Expected SHA-256: `ca506ebff084f2194d640a300207d9fa35a617ca2fe27eb0b0262c827cf3c884`
Expected bundle head: `6274f172ef2a8057bf466e6d552fa355171e2bbb`

## Non-negotiable rules

- Do not reset, rebase, cherry-pick, squash, amend, filter-rewrite, graft, or synthesize replacement commits.
- Do not force-push any existing branch.
- Do not impersonate missing historical SHAs with new commits.
- Do not merge the historical chain into `main` merely to make it reachable.
- Historical refs are custody refs, not production promotion refs.

## Credentialed import procedure

From a normal Git environment with write access to `BFochtman746/system-master` and access to the exact bundle file:

```bash
git clone https://github.com/BFochtman746/system-master.git system-master-recon001c
cd system-master-recon001c

sha256sum /path/to/UAF_FOUNDATION006_J.gitbundle
git bundle verify /path/to/UAF_FOUNDATION006_J.gitbundle

git fetch /path/to/UAF_FOUNDATION006_J.gitbundle \
  refs/heads/uaf-f006i-reference-schema:refs/remotes/sealed/foundation006-j

git cat-file -e 75b643d740e0f6d27ecc5da603a188074455fa22^{commit}
git cat-file -e 238fa67703c0818a9b84cf9d613512ddd6689d83^{commit}
git cat-file -e f0c567467462744d28fbff67d26807ad5779349e^{commit}
git cat-file -e 9bac3e6b289b3af627bc2ee3f3d066c6047d5d78^{commit}
git cat-file -e 6274f172ef2a8057bf466e6d552fa355171e2bbb^{commit}

git merge-base --is-ancestor 75b643d740e0f6d27ecc5da603a188074455fa22 238fa67703c0818a9b84cf9d613512ddd6689d83
git merge-base --is-ancestor 238fa67703c0818a9b84cf9d613512ddd6689d83 f0c567467462744d28fbff67d26807ad5779349e
git merge-base --is-ancestor f0c567467462744d28fbff67d26807ad5779349e 9bac3e6b289b3af627bc2ee3f3d066c6047d5d78
git merge-base --is-ancestor 9bac3e6b289b3af627bc2ee3f3d066c6047d5d78 6274f172ef2a8057bf466e6d552fa355171e2bbb

git push origin 75b643d740e0f6d27ecc5da603a188074455fa22:refs/heads/assurance-history/cq003-step003f-sealed
git push origin 238fa67703c0818a9b84cf9d613512ddd6689d83:refs/heads/assurance-history/foundation006-g-sealed
git push origin f0c567467462744d28fbff67d26807ad5779349e:refs/heads/assurance-history/foundation006-h-sealed
git push origin 9bac3e6b289b3af627bc2ee3f3d066c6047d5d78:refs/heads/assurance-history/foundation006-i-sealed
git push origin 6274f172ef2a8057bf466e6d552fa355171e2bbb:refs/heads/assurance-history/foundation006-j-sealed
```

Each push must be a new-ref creation. If any target ref already exists at a different SHA, **stop and adjudicate** instead of forcing it.

## Post-import verification

Require all of the following before closing RECON-001C import:

1. GitHub commit lookup resolves all five exact SHAs.
2. Each named historical branch head equals its required exact SHA.
3. The ancestry chain remains Step-003F -> G -> H -> I -> J.
4. Exact Step-003F historical tree still contains 26 Assurance production Java files and 12 Assurance test Java files.
5. No current production/source branch was rewritten.
6. `system-master/assurance-reconciliation-001` records the new custody state in a forward commit.

## A-01 successor

Only after the post-import checks above pass, the central portfolio-prep pass may move the existing bounded census successor from `HOLD` to `READY`:

- qualification: `ASSURANCE-RECON-001B-OVERNIGHT-DEEP-CENSUS`
- workstream: `SYSTEM-MASTER-ASSURANCE-RECON`
- subject: `5ae9dfbeff56cc05883d7ba3e9f7a4f0da43191c`
- purpose: targeted post-import GitHub source-custody verification

The frozen subject is intentionally retained because its qualifier enumerates current GitHub branches through the API while holding the census code itself fixed. The five `assurance-history/*` refs will make the imported exact objects observable to that frozen census without mutating its subject.

PASS of that successor would prove the custody repair became visible to the bounded census. It still would not prove ASSURANCE-001 completeness or production authorization.
