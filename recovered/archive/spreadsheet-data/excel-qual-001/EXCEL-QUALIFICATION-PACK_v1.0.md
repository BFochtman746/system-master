# Excel Qualification Pack v1.0

**Authority ID:** EXCEL-QUAL-001  
**Version:** 1.0.0  
**Packet:** PROGRAMMING-FOUNDATION-001I  
**State:** PORTABLE FOUNDATION DEFINED; real workbook/native execution remains subject-bound.

## 1. Mission

Define how the Programming App proves that Excel workbook work is correct, faithful, recoverable, and reproducible. The pack is format-aware and implementation-neutral. It does not declare Open XML, a Python library, COM automation, Office Scripts, Graph, or any other mechanism to be the Excel authority.

The governing rule is: **prove workbook bytes and custody, reconstruct every material workbook feature, mutate only through an admitted route, compare structure and semantics, execute native Excel verification when Excel behavior is material, rerun affected dependents, independently attempt to disprove the result, and seal exact output bytes.**

## 2. Foundation bindings

- UAF-001@4.0.0: evidence states, repair law, independent disproof, clean replay.
- ARCHIVE-001@1.0.0: ZIP/OPC custody, hostile staging, immutable originals, archive-bomb/path defenses.
- DEFECT-KNOWLEDGE-001@1.0.0: Known-Issue Preflight, failed-attempt memory, regression and prevention.
- RESOURCE-JOBS-001@1.0.0: bounded long-running calculation, rendering, refresh and comparison jobs.
- CAPABILITY-ROUTER-001@1.0.0: provider/library/native-executor routing without changing capability identity.
- CODE-QUAL-001@1.0.0: qualifies any code used to implement Excel capabilities; it does not certify workbook fidelity by itself.

## 3. Discover before mutating

Before mutation the agent MUST preserve the original bytes and establish filename, byte size, SHA-256, format family, custody receipt, package/part inventory, relationship graph, workbook/sheet inventory, formulas, names, tables, validations, styles, charts/drawings, PivotTables/PivotCaches, connections/queries, external links, active content, hidden state, protection state, and opaque/unsupported parts as applicable.

An `.xlsx`/`.xlsm` file is a multi-part package. Cell values alone are not the workbook. A workbook can be materially changed even when visible values look identical.

## 4. Formula and calculation law

Microsoft documents that formula cells can store cached results. A cached value proves only the value stored from a prior calculation, not that the current workbook was freshly recalculated. Microsoft also documents that `calcChain` records prior calculation order rather than the dependency graph. Therefore:

1. formula text/references and cached values are distinct evidence;
2. `calcChain` MUST NOT be treated as a dependency graph or correctness proof;
3. calculation mode, iteration, precision-as-displayed, data tables, volatile functions, external links and version-sensitive behavior MUST be dispositioned when material;
4. **value-only verification is forbidden when formula/calculation semantics are material**;
5. when native Excel behavior is required, a library-computed result cannot silently substitute for Excel execution.

## 5. Unsupported and opaque feature law

Unknown, unsupported, vendor-extension, binary, macro, control, XML-map, embedded-object, data-model or other opaque parts are data with custody. They MUST NOT be deleted merely because the chosen library cannot interpret them. The allowed dispositions are preserve byte-for-byte, preserve with proven safe normalization, explicitly transform under an approved requirement with evidence, quarantine/block, or route to a capable executor.

Format conversion is a semantic operation. `.xlsm` to `.xlsx`, workbook to CSV/text, browser copy/edit flows, legacy compatibility conversion, breaking workbook links, and similar operations require explicit feature-loss analysis.

## 6. Active content and trust

Inspecting VBA/macros, controls, connections, queries or external links does not authorize execution or refresh. Active content and external data operations require applicable permission, trust-boundary, security and resource policy. Macro presence, signature/trust status, and whether code executed MUST be recorded separately.

## 7. Qualification gates

- **XQ-G01 — Workbook, package and custody identity.**
- **XQ-G02 — Package structure, relationships and part inventory.**
- **XQ-G03 — Cell values, data types, errors and date/time fidelity.**
- **XQ-G04 — Formula syntax, references and cached-result semantics.**
- **XQ-G05 — Calculation configuration, dependencies, iteration and precision.**
- **XQ-G06 — Styles, number formats, conditional formatting and layout.**
- **XQ-G07 — Tables, defined names, validation and filtering.**
- **XQ-G08 — Charts, drawings, images, shapes and embedded objects.**
- **XQ-G09 — PivotTables, PivotCaches, slicers and data-model state.**
- **XQ-G10 — Connections, queries, refresh state and external data.**
- **XQ-G11 — External workbook links and linked-object references.**
- **XQ-G12 — VBA, macros, controls, XML maps and active/opaque features.**
- **XQ-G13 — Hidden state, workbook/worksheet protection and trust controls.**
- **XQ-G14 — Round-trip structural and semantic preservation.**
- **XQ-G15 — Native Excel open/save/recalculation/compatibility verification.**
- **XQ-G16 — Performance, resource use and large-workbook behavior.**
- **XQ-G17 — Affected-sheet and dependent regression.**
- **XQ-G18 — Independent disproof.**
- **XQ-G19 — Clean replay and fidelity seal.**

Every gate is REQUIRED, NOT_APPLICABLE_WITH_PROOF, or TARGET_NATIVE_PENDING. FINAL_PASS requires every required gate to PASS, every N/A decision to carry proof, no unresolved target/native gate, and evidence bound to the exact input/output workbook identity.

## 8. Round-trip fidelity

Round-trip PASS requires both **structural comparison** and **semantic comparison**. Structural comparison includes package parts, relationships, content types, workbook/sheet inventory and feature-specific structures. Semantic comparison includes formulas, values/types, names, tables, validations, styles, chart/Pivot/query/link semantics, hidden/protection state and any other material feature.

Expected normalization must be named. Unexpected part removal, relationship loss, active-content loss, formula-to-value conversion, link breakage, altered number/date types, style loss, changed hidden/protection state, or opaque-part loss fails the gate unless explicitly authorized and verified.

## 9. Native Excel verification

Native Excel evidence is required when the claim depends on Excel itself: recalculation/dependency rebuild, version-specific compatibility, desktop-only feature behavior, exact open/save normalization, rendering/print behavior when material, or a feature not faithfully represented by the portable executor.

If native Excel is unavailable, the exact gate becomes TARGET_NATIVE_PENDING. Portable inspection, comparison, test harness construction and other independent work continue. **Native-dependent claims MUST NOT be promoted to PASS without native evidence.**

## 10. Repair and regression

A workbook repair requires Known-Issue Preflight before mutation. Closure requires the original defect reproduction, verified fix, focused regression and affected-dependent regression. A change to a formula, name, table, query, link, Pivot source, chart series, style/number format or hidden/protected structure must trigger impact analysis across dependent sheets/objects/connections.

## 11. Performance/resource qualification

Measure real work: workbook bytes, part count, used cells, formula count, dependency breadth/depth, volatile functions, array/dynamic-array formulas, Pivot/cache size, external refresh volume, rendering objects, calculation duration, peak memory, I/O, temporary storage and native Excel process behavior. Resource limits come from RESOURCE-JOBS-001 and the detected environment; this pack invents no hardware limits.

## 12. Independent disproof

The builder cannot self-certify. The DISPROVER searches for stale cached values, missed formula dependencies, type/date coercion, hidden-sheet loss, style/format drift, broken names, damaged tables/validations, chart/Pivot/cache drift, connection/query changes, broken external links, macro/opaque-part loss, false N/A claims, unexecuted native gates, workload blind spots and evidence bound to the wrong workbook bytes.

## 13. Clean replay and fidelity seal

From immutable input bytes and frozen instructions, replay the admitted mutation and qualification path. Re-inventory the final workbook, rerun applicable gates, hash final bytes and produce a fidelity seal. A portable seal with unresolved native Excel requirements is `PORTABLE_COMPLETE_TARGET_PENDING`, never FINAL_PASS.

## 14. Research basis frozen for this packet

Official Microsoft/Open XML guidance revalidated on 2026-08-31 is recorded in `EXCEL-QUAL-RESEARCH-RECEIPT_v1.0.yaml`. Key conclusions are: cached formula values are not fresh recalculation proof; calculation-chain metadata is not a dependency graph; calculation mode/iteration/precision can materially affect results; workbooks are multi-part packages; file-format conversions and web editing can remove unsupported features; workbook links and external connections have refresh/trust semantics; and native Excel provides full recalculation/rebuild and format-aware save behavior.

## 15. Portable boundary

The Programming App source and a target workbook have not been supplied. This packet creates the qualification authority, contracts, examples and adversarial harness only. It does not claim that Excel is installed, that any real workbook has been opened/saved/recalculated, or that the Programming App currently implements these capabilities.
