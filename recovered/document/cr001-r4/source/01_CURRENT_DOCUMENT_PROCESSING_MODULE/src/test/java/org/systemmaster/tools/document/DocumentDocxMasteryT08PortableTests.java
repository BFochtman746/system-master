package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxAdvancedSemanticMasteryEngine;
import org.systemmaster.tools.docx.DocxReviewProtectionMasteryEngine;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T08 portable semantic, preservation, security and governed-spine qualification. */
public final class DocumentDocxMasteryT08PortableTests {
    private static final Instant FIXED = Instant.parse("2026-09-01T13:00:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T08 = t08Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testMailMerge();
        testRevisions();
        testComments();
        testProtectionAndRestrictedEditing();
        testCanonicalProjection();
        testGovernedSpine();
        testNegativeAndPreservationCases();
        check(T08.size() == 60, "T08 owns exactly 60 capabilities");
        System.out.println("DOCUMENT_DOCX_MASTERY_T08_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T08.size());
    }

    private static void testMailMerge() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = e.insertMailMergeField(source, "body/p:1", new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("FirstName", "\\* MERGEFORMAT", "<<FirstName>>"));
        source = e.insertMailMergeField(source, "body/p:2", new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("AccountId", "", "A-001"));
        List<DocxReviewProtectionMasteryEngine.MailMergeFieldSnapshot> fields = e.readMailMergeFields(source);
        check(fields.size() == 2, "mail merge READ enumerates typed native fields");
        check("FirstName".equals(fields.get(0).spec().fieldName()), "mail merge EXTRACT retains field name");
        check(fields.get(0).instruction().contains("MERGEFORMAT"), "mail merge EXTRACT retains switches");
        source = e.editMailMergeField(source, fields.get(0).locator(), new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("PreferredName", "\\* Upper", "Preferred"));
        check("PreferredName".equals(e.readMailMergeFields(source).get(0).spec().fieldName()), "mail merge MASTER edits targeted name");
        check("Preferred".equals(e.readMailMergeFields(source).get(0).spec().displayText()), "mail merge MASTER edits targeted result text");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t08-preserve.xml"), "mail merge preserves unrelated OPC part");
        byte[] complex = preserved(baseDocument());
        complex = new DocxAdvancedSemanticMasteryEngine().insertComplexField(complex, "body/p:3", new DocxAdvancedSemanticMasteryEngine.FieldSpec("MERGEFIELD ComplexName \\* MERGEFORMAT", "Complex result"));
        List<DocxReviewProtectionMasteryEngine.MailMergeFieldSnapshot> complexFields = e.readMailMergeFields(complex);
        check(complexFields.size() == 1 && "ComplexName".equals(complexFields.get(0).spec().fieldName()), "mail merge READ recognizes complex MERGEFIELD representation");
        complex = e.editMailMergeField(complex, complexFields.get(0).locator(), new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("ComplexEdited", "\\* Upper", "Complex edited result"));
        check("ComplexEdited".equals(e.readMailMergeFields(complex).get(0).spec().fieldName()), "mail merge MASTER edits complex MERGEFIELD representation");
        check("Complex edited result".equals(e.readMailMergeFields(complex).get(0).spec().displayText()), "complex MERGEFIELD result round-trips");
    }

    private static void testRevisions() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = e.insertTrackedInsertion(source, "body/p:3", revision(DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION, "101", "Alex Editor", "inserted text"));
        source = e.insertTrackedDeletion(source, "body/p:4", revision(DocxReviewProtectionMasteryEngine.RevisionKind.DELETION, "102", "Alex Editor", "deleted text"));
        source = e.createTrackedMove(source, "body/p:5", "body/p:6", revision(DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM, "103", "Move Editor", "moved text"));
        source = e.applyFormattingRevision(source, "body/p:7", new DocxReviewProtectionMasteryEngine.FormattingRevisionSpec("104", "Format Editor", FIXED.plusSeconds(4), true, true, "336699"));
        List<DocxReviewProtectionMasteryEngine.RevisionSnapshot> revisions = e.readRevisions(source);
        check(revisions.size() == 5, "revision READ enumerates insertion/deletion/move pair/format change");
        check(revisions.stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION && "inserted text".equals(r.spec().text())), "tracked insertion EXTRACT preserves text");
        check(revisions.stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.DELETION && "deleted text".equals(r.spec().text())), "tracked deletion EXTRACT preserves deleted text");
        check(revisions.stream().filter(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM || r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_TO).count() == 2, "tracked move EXTRACT preserves paired move sides");
        check(revisions.stream().anyMatch(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.FORMATTING), "format revision READ/EXTRACT identifies rPrChange");
        check(revisions.stream().allMatch(r -> !r.spec().author().isBlank() && !Instant.EPOCH.equals(r.spec().at())), "revision author/timestamp metadata are typed");
        DocxReviewProtectionMasteryEngine.RevisionSnapshot insertion = revisions.stream().filter(r -> r.spec().kind() == DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION).findFirst().orElseThrow();
        source = e.editRevision(source, insertion.locator(), new DocxReviewProtectionMasteryEngine.RevisionSpec(DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION, "101", "Revised Author", FIXED.plusSeconds(10), "edited insertion"));
        DocxReviewProtectionMasteryEngine.RevisionSnapshot edited = e.readRevisions(source).stream().filter(r -> "101".equals(r.spec().id())).findFirst().orElseThrow();
        check("Revised Author".equals(edited.spec().author()), "revision MASTER edits author metadata");
        check("edited insertion".equals(edited.spec().text()), "revision MASTER edits targeted tracked text");
        String settings = new String(OoxmlPackageSupport.read(source).get("word/settings.xml"), StandardCharsets.UTF_8);
        check(settings.contains("trackRevisions"), "revision creation enables native trackRevisions setting");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t08-preserve.xml"), "revision operations preserve unrelated OPC part");
    }

    private static void testComments() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = e.addClassicComment(source, "body/p:8", comment("Classic Author", "CA", "Classic feedback", 20));
        source = e.addModernComment(source, "body/p:9", comment("Modern Author", "MA", "Please review", 30), false,
                new DocxReviewProtectionMasteryEngine.MentionSpec("Jordan Reviewer", "PeoplePicker", "jordan@example.test"));
        List<DocxReviewProtectionMasteryEngine.CommentSnapshot> comments = e.readComments(source);
        check(comments.size() == 2, "comment READ enumerates classic and modern comments");
        check(comments.stream().anyMatch(c -> !c.modern() && c.spec().text().contains("Classic feedback")), "classic comment EXTRACT retains text");
        DocxReviewProtectionMasteryEngine.CommentSnapshot parent = comments.stream().filter(DocxReviewProtectionMasteryEngine.CommentSnapshot::modern).findFirst().orElseThrow();
        check(!parent.paraId().isBlank() && !parent.durableId().isBlank(), "modern comment EXTRACT retains para/durable identities");
        check(parent.mentions().stream().anyMatch(m -> "Jordan Reviewer".equals(m.displayName())), "comment mention EXTRACT resolves people identity");
        source = e.addModernReply(source, parent.id(), comment("Reply Author", "RA", "Reply accepted", 40), false,
                new DocxReviewProtectionMasteryEngine.MentionSpec("Modern Author", "None", "Modern Author"));
        comments = e.readComments(source);
        DocxReviewProtectionMasteryEngine.CommentSnapshot reply = comments.stream().filter(c -> c.parentId() != null).findFirst().orElseThrow();
        check(reply.parentId() == parent.id(), "modern threaded reply EXTRACT preserves parent identity");
        check(reply.mentions().stream().anyMatch(m -> "Modern Author".equals(m.displayName())), "reply mention identity round-trips");
        source = e.setCommentResolved(source, parent.id(), true);
        check(e.readComments(source).stream().filter(c -> c.id() == parent.id()).findFirst().orElseThrow().resolved(), "comment resolution state MASTER round-trips native done flag");
        source = e.editComment(source, reply.id(), comment("Reply Author", "RA", "Reply edited", 50), null);
        check(e.readComments(source).stream().filter(c -> c.id() == reply.id()).findFirst().orElseThrow().spec().text().contains("Reply edited"), "modern comment MASTER edits targeted comment body");
        Map<String, byte[]> parts = OoxmlPackageSupport.read(source);
        for (String part : List.of("word/comments.xml", "word/commentsExtended.xml", "word/commentsIds.xml", "word/commentsExtensible.xml", "word/people.xml")) check(parts.containsKey(part), "modern comment package includes " + part);
        String rels = new String(parts.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        check(rels.contains("commentsExtended") && rels.contains("commentsIds") && rels.contains("commentsExtensible") && rels.contains("relationships/people"), "modern comment relationships are native and complete");
        check(parts.containsKey("customXml/t08-preserve.xml"), "comment operations preserve unrelated OPC part");
    }

    private static void testProtectionAndRestrictedEditing() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = preserved(baseDocument());
        DocxReviewProtectionMasteryEngine.ProtectionSpec protection = new DocxReviewProtectionMasteryEngine.ProtectionSpec(
                DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, true, true, "rsaAES", "hash", "typeAny", 14, 100000, "QUJDRA==", "RUZHSA==");
        source = e.upsertDocumentProtection(source, protection);
        DocxReviewProtectionMasteryEngine.ProtectionSpec read = e.readDocumentProtection(source);
        check(read.edit() == DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, "document protection READ/EXTRACT preserves edit mode");
        check(read.enforcement() && read.formattingLocked(), "document protection READ/EXTRACT preserves enforcement flags");
        check(read.cryptSpinCount() == 100000 && "QUJDRA==".equals(read.hash()), "document protection EXTRACT preserves crypt metadata");
        source = e.upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("201", "editors", "body/p:10"));
        List<DocxReviewProtectionMasteryEngine.RestrictedRangeSnapshot> ranges = e.readRestrictedRanges(source);
        check(ranges.size() == 1 && "body/p:10".equals(ranges.get(0).spec().paragraphLocator()), "restricted editing CREATE/READ targets paragraph range");
        source = e.upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("201", "owners", "body/p:11"));
        ranges = e.readRestrictedRanges(source);
        check(ranges.size() == 1 && "body/p:11".equals(ranges.get(0).spec().paragraphLocator()), "restricted editing MASTER relocates owner range without duplicate markers");
        check("owners".equalsIgnoreCase(ranges.get(0).spec().editorGroup()), "restricted editing MASTER updates editor group");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t08-preserve.xml"), "protection/restriction preserve unrelated OPC part");
    }

    private static void testCanonicalProjection() throws Exception {
        byte[] source = fullFixture();
        CanonicalDocumentGraphV2 graph = project(source);
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "mail-merge-field".equals(e.semantic().role()) && "CustomerName".equals(e.semantic().properties().get("fieldName"))), "CDG-2 projects mail merge semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.REVISION && "tracked-revision".equals(e.semantic().role()) && "INSERTION".equals(e.semantic().properties().get("kind"))), "CDG-2 projects tracked revision semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.COMMENT && "modern-comment".equals(e.semantic().role())), "CDG-2 projects modern comment semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "comment-mention".equals(e.semantic().role())), "CDG-2 projects comment mention identity");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "document-protection".equals(e.semantic().role())), "CDG-2 projects document protection semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "restricted-editing".equals(e.semantic().role())), "CDG-2 projects restricted-editing semantics");
        check(graph.unknownNativeFeatures().stream().noneMatch(u -> Set.of("word/commentsExtended.xml", "word/commentsIds.xml", "word/commentsExtensible.xml", "word/people.xml").contains(u.nativePart())), "T08 represented comment parts are not treated as generic raw reachability");
    }

    private static void testGovernedSpine() throws Exception {
        byte[] source = preserved(baseDocument());
        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element paragraph = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH && "body/p:12".equals(e.nativeAnchor().locator())).findFirst().orElseThrow();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "INSERT_MAIL_MERGE_FIELD"); params.put("mailMerge.fieldName", "GovernedName"); params.put("mailMerge.switches", "\\* MERGEFORMAT"); params.put("mailMerge.displayText", "Governed merge");
        DocumentOperationContract op = new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "t08-spine-mailmerge", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.INSERT_CONTENT,
                List.of(DocumentSelector.node(paragraph.id())), "T08 governed mail merge insertion", params, DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(),
                Set.of("word/document.xml"), DocumentOperationContract.VisualImpact.LAYOUT_CHANGE, false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        Path root = Files.createTempDirectory("document-docx-mastery-t08-spine-");
        try {
            UniversalDocumentSpine spine = spine(root, new SyntheticRenderer());
            DocumentSpineJob job = job("t08-source", "t08-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(paragraph.id()), allCapabilities(), List.of());
            DocumentSpineResult result = spine.executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "T08 governed spine publishes verified draft");
            check(result.preservation() != null && result.preservation().pass(), "T08 governed spine preservation passes");
            check(result.finalization() != null && result.finalization().missing().isEmpty(), "T08 governed spine proof gates complete");
            check(new DocxReviewProtectionMasteryEngine().readMailMergeFields(result.resultBytes()).stream().anyMatch(f -> "GovernedName".equals(f.spec().fieldName())), "governed spine executes typed T08 mail-merge action");
            check(OoxmlPackageSupport.read(result.resultBytes()).containsKey("customXml/t08-preserve.xml"), "governed spine preserves unrelated custom XML");
        } finally { deleteTree(root); }
    }

    private static void testNegativeAndPreservationCases() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = baseDocument();
        expect(IllegalArgumentException.class, () -> new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("bad field", "", ""), "mail merge field name rejects ambiguous whitespace");
        expect(IllegalArgumentException.class, () -> new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("Name", "DDE AUTO exploit", ""), "effectful mail merge switches fail closed");
        expect(IllegalArgumentException.class, () -> new DocxReviewProtectionMasteryEngine.ProtectionSpec(DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, true, false, "", "", "", 0, 0, "hash", ""), "protection hash/salt pair must be complete");
        expect(IllegalArgumentException.class, () -> new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("1", "unknown-group", "body/p:1"), "restricted editing rejects unknown editor group");
        expect(IllegalArgumentException.class, () -> e.insertTrackedInsertion(source, "body/p:1", revision(DocxReviewProtectionMasteryEngine.RevisionKind.DELETION, "1", "x", "bad")), "revision API rejects wrong semantic kind");
        byte[] classic = e.addClassicComment(source, "body/p:1", comment("Classic", "C", "plain", 1));
        int classicId = e.readComments(classic).get(0).id();
        byte[] finalClassic = classic;
        expect(IllegalArgumentException.class, () -> e.setCommentResolved(finalClassic, classicId, true), "classic comment cannot falsely claim modern resolution metadata");
        expect(IllegalArgumentException.class, () -> e.addModernReply(finalClassic, classicId, comment("Reply", "R", "no", 2), false, null), "modern reply fails closed on classic parent");
        byte[] protection = e.upsertDocumentProtection(source, new DocxReviewProtectionMasteryEngine.ProtectionSpec(DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, true, true, "", "", "", 0, 0, "", ""));
        Map<String, byte[]> protectionParts = new LinkedHashMap<>(OoxmlPackageSupport.read(protection));
        String settings = new String(protectionParts.get("word/settings.xml"), StandardCharsets.UTF_8).replace(" w:enforcement=\"1\"", "").replace(" w:formatting=\"1\"", "");
        protectionParts.put("word/settings.xml", settings.getBytes(StandardCharsets.UTF_8));
        DocxReviewProtectionMasteryEngine.ProtectionSpec missingFlags = e.readDocumentProtection(OoxmlPackageSupport.write(protectionParts));
        check(!missingFlags.enforcement() && !missingFlags.formattingLocked(), "missing protection boolean attributes default false rather than true");
        byte[] rich = e.addClassicComment(source, "body/p:2", comment("Rich", "R", "plain", 3));
        Map<String, byte[]> richParts = new LinkedHashMap<>(OoxmlPackageSupport.read(rich));
        String richXml = new String(richParts.get("word/comments.xml"), StandardCharsets.UTF_8).replace("</w:comment>", "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>rich</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:comment>");
        richParts.put("word/comments.xml", richXml.getBytes(StandardCharsets.UTF_8));
        byte[] richComment = OoxmlPackageSupport.write(richParts);
        expect(IllegalArgumentException.class, () -> e.editComment(richComment, 0, comment("Rich", "R", "replace", 4), null), "generic comment edit fails closed instead of destroying rich comment content");
        byte[] restricted = e.upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("7", "editors", "body/p:1"));
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(restricted));
        String xml = new String(parts.get("word/document.xml"), StandardCharsets.UTF_8).replaceFirst("<w:permEnd[^>]*/>", "");
        parts.put("word/document.xml", xml.getBytes(StandardCharsets.UTF_8));
        byte[] malformedRange = OoxmlPackageSupport.write(parts);
        expect(java.io.IOException.class, () -> e.readRestrictedRanges(malformedRange), "incomplete restricted-editing range fails closed");
    }

    private static byte[] fullFixture() throws Exception {
        DocxReviewProtectionMasteryEngine e = new DocxReviewProtectionMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = e.insertMailMergeField(source, "body/p:1", new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec("CustomerName", "\\* MERGEFORMAT", "Customer Name"));
        source = e.insertTrackedInsertion(source, "body/p:2", revision(DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION, "301", "T08 Editor", "T08 inserted"));
        source = e.insertTrackedDeletion(source, "body/p:3", revision(DocxReviewProtectionMasteryEngine.RevisionKind.DELETION, "302", "T08 Editor", "T08 deleted"));
        source = e.createTrackedMove(source, "body/p:4", "body/p:5", revision(DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM, "303", "T08 Editor", "T08 moved"));
        source = e.applyFormattingRevision(source, "body/p:6", new DocxReviewProtectionMasteryEngine.FormattingRevisionSpec("304", "T08 Editor", FIXED, true, false, "005A9C"));
        source = e.addClassicComment(source, "body/p:7", comment("Classic T08", "CT", "Classic T08 comment", 10));
        source = e.addModernComment(source, "body/p:8", comment("Modern T08", "MT", "Modern T08 review", 11), false, new DocxReviewProtectionMasteryEngine.MentionSpec("Review Person", "PeoplePicker", "review@example.test"));
        int parent = e.readComments(source).stream().filter(DocxReviewProtectionMasteryEngine.CommentSnapshot::modern).findFirst().orElseThrow().id();
        source = e.addModernReply(source, parent, comment("Reply T08", "RT", "T08 reply", 12), true, null);
        source = e.upsertDocumentProtection(source, new DocxReviewProtectionMasteryEngine.ProtectionSpec(DocxReviewProtectionMasteryEngine.ProtectionEdit.READ_ONLY, true, false, "", "", "", 0, 0, "", ""));
        source = e.upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec("401", "editors", "body/p:9"));
        return source;
    }

    private static DocxReviewProtectionMasteryEngine.RevisionSpec revision(DocxReviewProtectionMasteryEngine.RevisionKind kind, String id, String author, String text) {
        return new DocxReviewProtectionMasteryEngine.RevisionSpec(kind, id, author, FIXED.plusSeconds(Integer.parseInt(id) % 60), text);
    }
    private static DocxReviewProtectionMasteryEngine.CommentSpec comment(String author, String initials, String text, long offset) { return new DocxReviewProtectionMasteryEngine.CommentSpec(author, initials, FIXED.plusSeconds(offset), text); }
    private static byte[] baseDocument() throws Exception { ArrayList<String> paragraphs = new ArrayList<>(); for (int i = 1; i <= 20; i++) paragraphs.add("T08 host " + i); return new DocxFullLaneEngine().createDocument(paragraphs); }
    private static byte[] preserved(byte[] source) throws Exception { Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); parts.put("customXml/t08-preserve.xml", "<t08 preserve=\"true\"/>".getBytes(StandardCharsets.UTF_8)); return OoxmlPackageSupport.write(parts); }
    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static Set<String> t08Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 436; i <= 495; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static Set<String> allCapabilities() { LinkedHashSet<String> ids = new LinkedHashSet<>(T08); for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i)); for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); ids.add("UDM-FOUNDATION-0064"); for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(ids); }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        FilePlatform008Repository repo = new FilePlatform008Repository(root.resolve("meta")); GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("bytes"), ArtifactIntakePolicy.conservative(64L * 1024 * 1024), repo, CLOCK);
        return new UniversalDocumentSpine(gateway, new FileDocumentSpineCheckpointStore(root.resolve("cp")), new FileDocumentSpineVersionStore(root.resolve("versions")), new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK), CLOCK,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(CLOCK));
    }
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T08-PORTABLE", "qualification", FIXED); }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expect(Class<? extends Throwable> expected, Throwing action, String message) throws Exception { assertions++; try { action.run(); } catch (Throwable t) { if (expected.isInstance(t)) return; throw new AssertionError(message + " wrong exception=" + t, t); } throw new AssertionError(message + " did not fail"); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path p : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private static String sha(byte[] bytes) { return OoxmlPackageSupport.sha256(bytes); }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t08 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t08", "SyntheticRasterOracle", "docx-mastery-t08", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t08".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }
}
