# FOUNDATION-SPINE-CHANGE-RULES-001

Status: CANONICAL DOCUMENTATION GOVERNANCE

## Goal

Prevent the new documentation from becoming another accumulation of addenda, overlapping labels and stale authority prose.

## Rules

1. The documentation manifest identifies the only current canonical Foundation & Spine docs.
2. Exactly one current document exists for each documented authority/topic. Revisions replace the current version and preserve history in Git; they do not create side-by-side competing authorities.
3. Operational evidence/reconciliation records may accumulate, but they do not become architecture authority unless intentionally incorporated into a canonical doc revision.
4. Every architecture change must state: problem; evidence/research; affected owner; capability change; data/state change; interface/contract change; migration; qualification impact; superseded text; implementation impact.
5. A new FS authority is allowed only if it owns a genuinely new canonical question that cannot be safely assigned to an existing authority.
6. Renaming does not transfer semantic ownership. Mergers/splits require an explicit data/interface/evidence migration.
7. Historical component IDs may appear only as implementation/evidence mappings, not as the target architecture's organizing principle.
8. Current implementation may reveal that this target design is wrong. The documentation must be corrected rather than forcing code/history to fit the prose.
9. Documentation never promotes implementation or qualification status by wording. Status lives in explicit implementation/evidence records.
10. An environment-unavailable qualification gate, including A-01, is recorded as unexecuted rather than failure.
11. Every canonical change increments the manifest/version and identifies the superseded version.
12. No architecture closure declaration is valid while owner overlaps, orphan canonical state, undefined failure behavior or ambiguous recovery authority remain.

## Required review questions

Before accepting a documentation change:
- Does it make the system simpler or merely add another layer/name?
- Is there one and only one owner for each canonical fact?
- Does it preserve the end-to-end Work Chain?
- Does it preserve specialist semantic ownership?
- Does it define failure/recovery, not only success?
- Are resource/security/privacy/rights/AI-safety consequences explicit?
- Is the design implementable and testable?
- What prior text is superseded?

## Anti-append rule

Do not solve contradictions by adding another paragraph saying both things. Resolve the contradiction, choose the intended architecture, update the canonical document, and let Git preserve the old version.