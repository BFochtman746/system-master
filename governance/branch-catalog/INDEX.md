# Branch catalog — every file path that exists off main

3,651 unique paths across 423 unmerged branches.
837 exist on exactly ONE branch.

Recover any file without merging its branch:

```sh
git checkout origin/<newest_branch> -- <path>
```

| shard | paths | bytes |
|---|---:|---:|
| `.document-import-staging.tsv` | 7 | 776 |
| `.github.tsv` | 607 | 64,607 |
| `_root.tsv` | 9 | 497 |
| `books.tsv` | 133 | 15,561 |
| `control-gateway.tsv` | 16 | 1,440 |
| `control-gateway-r01-proof.tsv` | 1 | 126 |
| `control-gateway-r02-proof.tsv` | 1 | 126 |
| `control-gateway-state.tsv` | 38 | 7,850 |
| `controller-v2.tsv` | 204 | 18,859 |
| `controller-v2-transport-test.tsv` | 1 | 119 |
| `docs.tsv` | 3 | 284 |
| `documents.tsv` | 43 | 5,463 |
| `governance.tsv` | 248 | 25,774 |
| `learning.tsv` | 466 | 57,430 |
| `programming-controller.tsv` | 45 | 3,920 |
| `qualification.part01.tsv` | 599 | 77,836 |
| `qualification.part02.tsv` | 412 | 53,833 |
| `reconciliation.tsv` | 3 | 316 |
| `recovered.tsv` | 242 | 46,843 |
| `recovery.tsv` | 1 | 102 |
| `system-master.tsv` | 489 | 67,141 |
| `tests.tsv` | 11 | 839 |
| `tools.tsv` | 11 | 874 |
| `transport.tsv` | 61 | 5,653 |

`holder_count` 1 means this shard names the only copy in the
repository. See BRANCH-INVENTORY.md for the sole-custodian branch list.
