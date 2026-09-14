# Learning 113-row traceability shards

These six files are the row payload for `LEARNING-113-REQUIREMENT-CURRENT-TRACEABILITY-001`.

The canonical schema, profile tables, disposition meanings, source hashes, row counts, and per-shard SHA-256 values are defined in `governance/learning/LEARNING-113-REQUIREMENT-CURRENT-TRACEABILITY-001.json`.

Rows are compact tuples to keep the governance payload diffable. Integer owner/component/blocking-gate values are indexes into the profile arrays in the canonical index. Flags are additive: `H` production-handler binding open, `N` new 001D `LRN-001C-Qxxx` requirement-test surface, `D` direct portable implementation-evidence gap, `B` 001D blocking gate present.

Every row is traceability-closed under current authority only. No row is thereby promoted to implementation, production, native, human, psychometric, SME, or external-conformance completion.
