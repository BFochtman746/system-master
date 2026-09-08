# BOOK-EVAL-LEMONADE-001-BLIND-RESUME-003-ADAPTER-REPAIR

## Standing

**PASS_REPAIR_VALIDATED_READY_FOR_FRESH_E5_REQUALIFICATION**

## Root cause

The Lemonade `/v1/responses` adapter requested JSON-only output but did not have a server-side JSON-schema constraint. Live diagnostic case `BQE2-C114B550AACD1212` returned a valid task-mode `primary_finding=LEGITIMATE_TRADEOFF` but placed natural-language rationale in `findings[]`. The fail-closed decoder correctly rejected that value because `findings[]` is an ontology-token set.

The v1.0 prompt also gave unconditional clean-case and legitimate-tradeoff guidance even when a token was not legal for the current task mode.

## Repair

- Keep the decoder and task-mode ontology validation strict and fail closed.
- Do not coerce prose into ontology tokens.
- Keep the E4 system prompt byte-identical to the existing evaluator.
- Add an E5-only token contract requiring `primary_finding` and every `findings[]` member to be exact allowed ontology tokens.
- Require every `evidence_refs[]` member to be an exact individual provider-visible reference label.
- State explicitly that explanatory prose must not be encoded into token fields.
- Emit clean-case guidance only when `NO_MATERIAL_PROBLEM` is legal for the task mode.
- Emit legitimate-tradeoff guidance only when `LEGITIMATE_TRADEOFF` is legal for the task mode.

## Fingerprint disposition

- E4 candidate fingerprint remains exactly `7e7e7588138081f9ac3eaca75229934c137307927ac5ea0529ea800d601e03fc`.
- Old E5 candidate fingerprint: `8031e11f737aa048b7eddd0e1810641ba29a79e7334a945b07e30b4e043a2c59`.
- Repaired E5 candidate fingerprint: `3d275e96b5b231fdc2ab08eac70486cb7d4f858e25143fd404a5e039c431f598`.

Therefore the existing E4 `160/160` evidence remains admissible, but the old E5 `117/160` evidence is preserved as historical pre-repair evidence and MUST NOT be mixed with repaired E5 evidence. Repaired E5 requalification starts at `0/160` under a new run root and the repaired fingerprint.

## Qualification evidence

Workflow run `34186308224`, job `101935218452`:

- repair regression assertions: `26/26 PASS`
- frozen four inputs: unchanged
- persistent pre-repair state: `E4 160 / E5 117`
- persistent state mutated: `false`
- scoring-private accessed: `false`
- live repaired pairwise case: `BQE2-C114B550AACD1212`
- E5 live members: `4/4 PASS`
- aggregate primary finding: `LEGITIMATE_TRADEOFF`
- position stable: `true`
- evidence artifact: `10040624559`
- artifact SHA-256: `ff5e79a2a4101f5bcd588da93feb4a42893febd74874c3fa1870e0d85e6be10a`

## Campaign rule

Use a new persistent run root for repaired E5. Copy only the exact E4 frozen evidence and runtime identity from the pre-repair run. Never overwrite the pre-repair E5-117 evidence. Preserve the frozen corpus, ontology, execution manifest, model identity, and blind/gold boundary unchanged.
