package org.systemmaster.tools.document;

import java.util.*;

/** Explicit product boundary for the Universal Document module. */
public final class DocumentFormatCapabilities {
    public record Capability(String id, String format, String capability, String standing) {}
    private static final List<Capability> ALL = List.of(
        new Capability("DOCUMENT-CAP-001","DOCX/DOCM","inspect/create/edit/structure/accessibility/diff/verify","RECOVERED_PORTABLE_FULL_LANE"),
        new Capability("DOCUMENT-CAP-002","PDF","inspect/create/diagnose/qualified-engine routing/full-lane ledger","RECOVERED_PORTABLE_FULL_LANE"),
        new Capability("DOCUMENT-CAP-003","PPTX/PPTM","inspect/create PPTX/edit text/notes/media/package structure/accessibility/diff/verify","RECOVERED_PORTABLE_FULL_LANE"),
        new Capability("DOCUMENT-CAP-004","Markdown","inspect/create/edit/extract/semantic-convert","PORTABLE_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-005","Plain text","inspect/create/edit/extract/semantic-convert","PORTABLE_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-006","HTML document","safe inspect/create/edit/text extraction/semantic-convert; never execute scripts","PORTABLE_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-007","RTF","bounded UTF-8 RTF create/edit/plain-text projection","PORTABLE_SUBSET_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-008","ODT","recognize/route","ENGINE_PENDING"),
        new Capability("DOCUMENT-CAP-009","EPUB","recognize/route","ENGINE_PENDING"),
        new Capability("DOCUMENT-CAP-010","Legacy DOC","recognize/route","QUALIFIED_CONVERSION_ENGINE_PENDING"),
        new Capability("DOCUMENT-CAP-011","Legacy PPT/ODP/PPSX/POTX","recognize/route; use qualified presentation converter/render oracle","QUALIFIED_CONVERSION_ENGINE_PENDING"),
        new Capability("DOCUMENT-CAP-012","Cross-format","semantic derivatives across active document/presentation formats with explicit loss ledger","PORTABLE_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-013","OCR/scanned documents","image preprocessing, recognition graph, confidence/evidence, qualified Tesseract adapter","RECOVERED_PORTABLE_FULL_LANE"),
        new Capability("DOCUMENT-CAP-014","HTML vs Web boundary","HTML as human-document interchange only; website construction remains Web pillar","BOUNDARY_ENFORCED"),
        new Capability("DOCUMENT-CAP-015","Markdown intent boundary","Markdown human documents owned here; repository/source Markdown may remain Programming/Web","BOUNDARY_ENFORCED"),
        new Capability("DOCUMENT-CAP-016","Spreadsheet boundary","XLSX/XLSM/XLS/CSV/ODS spreadsheet semantics remain Excel pillar","BOUNDARY_ENFORCED"),
        new Capability("DOCUMENT-CAP-017","Presentation ownership","PowerPoint/presentation semantics are owned by this module, not Programming/Web","BOUNDARY_ENFORCED"),
        new Capability("DOCUMENT-CAP-018","Canonical Document Graph","CDG-1 semantic projection with stable node ids and native source anchors","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-019","Native-part preservation","source/result part digest map with bounded expected-change allowlist, no blanket wildcard, and fail-closed unexpected-change detection","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-020","Universal operation contract","source/semantic preconditions, selectors, intended effect, rollback, risk, loss and proof requirements","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-021","Render proof receipts","rendered PDF/raster/page/text/image evidence bound by digests","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-022","Independent render worker","fresh-workspace LibreOffice + Poppler provider contract with input/output/page/time bounds and minimal child-process environment","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-023","Visual QA","blank-page, geometry, edge-clipping-risk, text and image presence checks","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-024","Final proof authority","ordered proof states, independent package proof, fail-closed receipt conflicts, and FINAL_PROOFED promotion gate across six proof classes","WORLD_CLASS_001A_IMPLEMENTED"),
        new Capability("DOCUMENT-CAP-025","Deterministic qualification","clean headless Java 21 argfile build and complete regression/render qualification","WORLD_CLASS_001A_IMPLEMENTED")
    );
    private DocumentFormatCapabilities() {}
    public static List<Capability> all() { return ALL; }
}
