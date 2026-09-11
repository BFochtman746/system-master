package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Typed DOCX T08 mail merge, revisions, comments, protection and restricted-editing authority. */
public final class DocxReviewProtectionMasteryEngine {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
    private static final String W15 = "http://schemas.microsoft.com/office/word/2012/wordml";
    private static final String W16CID = "http://schemas.microsoft.com/office/word/2016/wordml/cid";
    private static final String W16CEX = "http://schemas.microsoft.com/office/word/2018/wordml/cex";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CT = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String COMMENTS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
    private static final String COMMENTS_EXTENDED_REL = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
    private static final String COMMENTS_IDS_REL = "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds";
    private static final String COMMENTS_EXTENSIBLE_REL = "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible";
    private static final String PEOPLE_REL = "http://schemas.microsoft.com/office/2011/relationships/people";

    public enum RevisionKind { INSERTION, DELETION, MOVE_FROM, MOVE_TO, FORMATTING }
    public enum ProtectionEdit { NONE, READ_ONLY, COMMENTS, TRACKED_CHANGES, FORMS }

    public record MailMergeFieldSpec(String fieldName, String switches, String displayText) {
        public MailMergeFieldSpec {
            fieldName = token(fieldName, "mail merge field name", 128);
            switches = clean(switches);
            displayText = Objects.requireNonNullElse(displayText, "");
            String upper = switches.toUpperCase(Locale.ROOT);
            if (upper.contains("DDE") || upper.contains("MACROBUTTON") || upper.contains("INCLUDETEXT") || upper.contains("INCLUDEPICTURE")) {
                throw new IllegalArgumentException("effectful mail-merge switch blocked");
            }
        }
    }
    public record MailMergeFieldSnapshot(String locator, MailMergeFieldSpec spec, String instruction) {}

    public record RevisionSpec(RevisionKind kind, String id, String author, Instant at, String text) {
        public RevisionSpec {
            Objects.requireNonNull(kind, "kind");
            id = numericId(id, "revision id");
            author = boundedText(author, "revision author", 256);
            Objects.requireNonNull(at, "revision date");
            text = Objects.requireNonNullElse(text, "");
        }
    }
    public record FormattingRevisionSpec(String id, String author, Instant at, boolean bold, boolean italic, String color) {
        public FormattingRevisionSpec {
            id = numericId(id, "revision id");
            author = boundedText(author, "revision author", 256);
            Objects.requireNonNull(at, "revision date");
            color = clean(color).toUpperCase(Locale.ROOT);
            if (!color.isBlank() && !color.matches("[0-9A-F]{6}")) throw new IllegalArgumentException("format revision color must be six hex digits");
        }
    }
    public record RevisionSnapshot(String locator, RevisionSpec spec, Map<String, String> nativeProperties) {
        public RevisionSnapshot { nativeProperties = Map.copyOf(Objects.requireNonNullElse(nativeProperties, Map.of())); }
    }

    public record MentionSpec(String displayName, String providerId, String userId) {
        public MentionSpec {
            displayName = boundedText(displayName, "mention display name", 256);
            providerId = clean(providerId).isBlank() ? "None" : clean(providerId);
            userId = clean(userId).isBlank() ? displayName : clean(userId);
        }
    }
    public record CommentSpec(String author, String initials, Instant at, String text) {
        public CommentSpec {
            author = boundedText(author, "comment author", 256);
            initials = boundedText(initials, "comment initials", 32);
            Objects.requireNonNull(at, "comment date");
            text = boundedText(text, "comment text", 32_000);
        }
    }
    public record CommentSnapshot(
            String locator,
            int id,
            CommentSpec spec,
            boolean modern,
            Integer parentId,
            boolean resolved,
            String paraId,
            String durableId,
            List<MentionSpec> mentions) {
        public CommentSnapshot { mentions = List.copyOf(Objects.requireNonNullElse(mentions, List.of())); }
    }

    public record ProtectionSpec(
            ProtectionEdit edit,
            boolean enforcement,
            boolean formattingLocked,
            String cryptProviderType,
            String cryptAlgorithmClass,
            String cryptAlgorithmType,
            int cryptAlgorithmSid,
            int cryptSpinCount,
            String hash,
            String salt) {
        public ProtectionSpec {
            Objects.requireNonNull(edit, "edit");
            cryptProviderType = clean(cryptProviderType);
            cryptAlgorithmClass = clean(cryptAlgorithmClass);
            cryptAlgorithmType = clean(cryptAlgorithmType);
            hash = clean(hash);
            salt = clean(salt);
            if (cryptAlgorithmSid < 0 || cryptSpinCount < 0) throw new IllegalArgumentException("protection crypt values must be non-negative");
            if ((!hash.isBlank() || !salt.isBlank()) && (hash.isBlank() || salt.isBlank())) throw new IllegalArgumentException("protection hash and salt must be supplied together");
        }
    }
    public record RestrictedRangeSpec(String id, String editorGroup, String paragraphLocator) {
        public RestrictedRangeSpec {
            id = numericId(id, "permission id");
            editorGroup = clean(editorGroup).isBlank() ? "everyone" : clean(editorGroup);
            if (!Set.of("everyone", "administrators", "contributors", "editors", "owners", "current").contains(editorGroup.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("unsupported editor group");
            }
            paragraphLocator = requireParagraphLocator(paragraphLocator);
        }
    }
    public record RestrictedRangeSnapshot(String locator, RestrictedRangeSpec spec) {}

    public List<MailMergeFieldSnapshot> readMailMergeFields(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<MailMergeFieldSnapshot> out = new ArrayList<>();
        NodeList simple = doc.getElementsByTagNameNS(W, "fldSimple");
        int ordinal = 0;
        for (int i = 0; i < simple.getLength(); i++) {
            Element field = (Element) simple.item(i);
            String instruction = clean(attribute(field, W, "instr"));
            if (!firstToken(instruction).equals("MERGEFIELD")) continue;
            ordinal++;
            out.add(new MailMergeFieldSnapshot("mail-merge:" + ordinal, parseMailMerge(instruction, wordText(field)), instruction));
        }
        for (Element paragraph : bodyParagraphs(doc)) {
            List<Element> runs = directChildren(paragraph, W, "r");
            for (int i = 0; i < runs.size(); i++) {
                if (!fieldCharType(runs.get(i), "begin")) continue;
                StringBuilder instruction = new StringBuilder();
                StringBuilder result = new StringBuilder();
                boolean separate = false;
                int end = -1;
                for (int j = i + 1; j < runs.size(); j++) {
                    Element run = runs.get(j);
                    if (fieldCharType(run, "separate")) { separate = true; continue; }
                    if (fieldCharType(run, "end")) { end = j; break; }
                    if (separate) result.append(textContent(run, W, "t")); else instruction.append(textContent(run, W, "instrText"));
                }
                if (end < 0 || !firstToken(instruction.toString()).equals("MERGEFIELD")) continue;
                ordinal++;
                String code = clean(instruction.toString());
                out.add(new MailMergeFieldSnapshot("mail-merge:" + ordinal, parseMailMerge(code, result.toString()), code));
                i = end;
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertMailMergeField(byte[] bytes, String paragraphLocator, MailMergeFieldSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element field = doc.createElementNS(W, "w:fldSimple");
        setAttribute(field, W, "w:instr", "instr", mailMergeInstruction(spec));
        field.appendChild(textRun(doc, spec.displayText().isBlank() ? "<<" + spec.fieldName() + ">>" : spec.displayText()));
        locateParagraph(doc, paragraphLocator).appendChild(field);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editMailMergeField(byte[] bytes, String locator, MailMergeFieldSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        if (!locator.matches("mail-merge:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe mail merge locator: " + locator);
        int wanted = Integer.parseInt(locator.substring("mail-merge:".length()));
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        int ordinal = 0;
        NodeList simple = doc.getElementsByTagNameNS(W, "fldSimple");
        for (int i = 0; i < simple.getLength(); i++) {
            Element field = (Element) simple.item(i);
            if (!firstToken(attribute(field, W, "instr")).equals("MERGEFIELD")) continue;
            if (++ordinal == wanted) {
                setAttribute(field, W, "w:instr", "instr", mailMergeInstruction(spec));
                while (field.getFirstChild() != null) field.removeChild(field.getFirstChild());
                field.appendChild(textRun(doc, spec.displayText().isBlank() ? "<<" + spec.fieldName() + ">>" : spec.displayText()));
                parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
                return OoxmlPackageSupport.write(parts);
            }
        }
        for (Element paragraph : bodyParagraphs(doc)) {
            List<Element> runs = directChildren(paragraph, W, "r");
            for (int i = 0; i < runs.size(); i++) {
                if (!fieldCharType(runs.get(i), "begin")) continue;
                StringBuilder instruction = new StringBuilder();
                boolean separate = false;
                int separateIndex = -1;
                int end = -1;
                for (int j = i + 1; j < runs.size(); j++) {
                    Element run = runs.get(j);
                    if (fieldCharType(run, "separate")) { separate = true; separateIndex = j; continue; }
                    if (fieldCharType(run, "end")) { end = j; break; }
                    if (!separate) instruction.append(textContent(run, W, "instrText"));
                }
                if (end < 0 || !firstToken(instruction.toString()).equals("MERGEFIELD")) continue;
                if (++ordinal == wanted) {
                    replaceComplexMailMergeField(doc, runs, i, separateIndex, end, spec);
                    parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
                    return OoxmlPackageSupport.write(parts);
                }
                i = end;
            }
        }
        throw new IllegalArgumentException("mail merge field not found: " + locator);
    }

    private static void replaceComplexMailMergeField(Document doc, List<Element> runs, int begin, int separate, int end, MailMergeFieldSpec spec) {
        if (separate < 0 || separate >= end) throw new IllegalArgumentException("complex MERGEFIELD missing separate marker");
        Element firstInstruction = null;
        for (int j = begin + 1; j < separate; j++) {
            NodeList texts = runs.get(j).getElementsByTagNameNS(W, "instrText");
            for (int k = 0; k < texts.getLength(); k++) {
                Element it = (Element) texts.item(k);
                if (firstInstruction == null) { firstInstruction = it; it.setTextContent(mailMergeInstruction(spec)); } else it.setTextContent("");
            }
        }
        if (firstInstruction == null) {
            Element run = doc.createElementNS(W, "w:r");
            Element it = doc.createElementNS(W, "w:instrText");
            it.setTextContent(mailMergeInstruction(spec));
            run.appendChild(it);
            runs.get(separate).getParentNode().insertBefore(run, runs.get(separate));
        }
        String display = spec.displayText().isBlank() ? "<<" + spec.fieldName() + ">>" : spec.displayText();
        Element firstResult = null;
        for (int j = separate + 1; j < end; j++) {
            NodeList texts = runs.get(j).getElementsByTagNameNS(W, "t");
            for (int k = 0; k < texts.getLength(); k++) {
                Element tx = (Element) texts.item(k);
                if (firstResult == null) { firstResult = tx; tx.setTextContent(display); } else tx.setTextContent("");
            }
        }
        if (firstResult == null) runs.get(end).getParentNode().insertBefore(textRun(doc, display), runs.get(end));
    }

    public List<RevisionSnapshot> readRevisions(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<Element> elements = new ArrayList<>();
        collectRevisionElements(doc.getDocumentElement(), elements);
        ArrayList<RevisionSnapshot> out = new ArrayList<>();
        int ordinal = 0;
        for (Element revision : elements) {
            RevisionKind kind = revisionKind(revision);
            String id = attribute(revision, W, "id");
            String author = attribute(revision, W, "author");
            String date = attribute(revision, W, "date");
            Instant at = parseInstant(date);
            String text = kind == RevisionKind.DELETION || kind == RevisionKind.MOVE_FROM ? textContent(revision, W, "delText") : textContent(revision, W, "t");
            LinkedHashMap<String, String> props = new LinkedHashMap<>();
            props.put("nativeLocalName", revision.getLocalName());
            if (kind == RevisionKind.FORMATTING) props.put("owner", revision.getParentNode() instanceof Element e ? e.getLocalName() : "");
            out.add(new RevisionSnapshot("revision:" + (++ordinal), new RevisionSpec(kind, id, author.isBlank() ? "Unknown" : author, at, text), props));
        }
        return List.copyOf(out);
    }

    public byte[] insertTrackedInsertion(byte[] bytes, String paragraphLocator, RevisionSpec spec) throws IOException {
        requireKind(spec, RevisionKind.INSERTION);
        return appendRevision(bytes, paragraphLocator, spec, "ins", false);
    }

    public byte[] insertTrackedDeletion(byte[] bytes, String paragraphLocator, RevisionSpec spec) throws IOException {
        requireKind(spec, RevisionKind.DELETION);
        return appendRevision(bytes, paragraphLocator, spec, "del", true);
    }

    public byte[] createTrackedMove(byte[] bytes, String fromParagraphLocator, String toParagraphLocator, RevisionSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        if (!(spec.kind() == RevisionKind.MOVE_FROM || spec.kind() == RevisionKind.MOVE_TO)) throw new IllegalArgumentException("move spec kind required");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element from = locateParagraph(doc, fromParagraphLocator);
        Element to = locateParagraph(doc, toParagraphLocator);
        String id = spec.id();
        from.appendChild(moveRangeMarker(doc, "moveFromRangeStart", id, spec.author()));
        from.appendChild(revisionElement(doc, "moveFrom", new RevisionSpec(RevisionKind.MOVE_FROM, id, spec.author(), spec.at(), spec.text()), true));
        from.appendChild(moveRangeMarker(doc, "moveFromRangeEnd", id, spec.author()));
        to.appendChild(moveRangeMarker(doc, "moveToRangeStart", id, spec.author()));
        to.appendChild(revisionElement(doc, "moveTo", new RevisionSpec(RevisionKind.MOVE_TO, id, spec.author(), spec.at(), spec.text()), false));
        to.appendChild(moveRangeMarker(doc, "moveToRangeEnd", id, spec.author()));
        ensureTrackRevisions(parts);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] applyFormattingRevision(byte[] bytes, String paragraphLocator, FormattingRevisionSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element paragraph = locateParagraph(doc, paragraphLocator);
        Element run = first(paragraph.getElementsByTagNameNS(W, "r"));
        if (run == null) { run = doc.createElementNS(W, "w:r"); run.appendChild(textNode(doc, "")); paragraph.appendChild(run); }
        Element rPr = firstDirect(run, W, "rPr");
        if (rPr == null) { rPr = doc.createElementNS(W, "w:rPr"); run.insertBefore(rPr, run.getFirstChild()); }
        Element before = (Element) rPr.cloneNode(true);
        removeDirect(rPr, W, "rPrChange");
        setBooleanProperty(doc, rPr, "b", spec.bold());
        setBooleanProperty(doc, rPr, "i", spec.italic());
        if (!spec.color().isBlank()) { removeDirect(rPr, W, "color"); Element color = doc.createElementNS(W, "w:color"); setAttribute(color, W, "w:val", "val", spec.color()); rPr.appendChild(color); }
        Element change = doc.createElementNS(W, "w:rPrChange");
        setRevisionAttributes(change, spec.id(), spec.author(), spec.at());
        removeDirect(before, W, "rPrChange");
        change.appendChild(before);
        rPr.appendChild(change);
        ensureTrackRevisions(parts);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editRevision(byte[] bytes, String locator, RevisionSpec replacement) throws IOException {
        Objects.requireNonNull(replacement, "replacement");
        RevisionElementLocated located = locateRevision(bytes, locator);
        Map<String, byte[]> parts = located.parts();
        Element element = located.element();
        RevisionKind actual = revisionKind(element);
        if (actual != replacement.kind()) throw new IllegalArgumentException("revision kind cannot change during edit");
        setRevisionAttributes(element, replacement.id(), replacement.author(), replacement.at());
        if (actual != RevisionKind.FORMATTING && !replacement.text().isEmpty()) {
            String textLocal = actual == RevisionKind.DELETION || actual == RevisionKind.MOVE_FROM ? "delText" : "t";
            NodeList texts = element.getElementsByTagNameNS(W, textLocal);
            if (texts.getLength() == 0) element.appendChild(textRunForRevision(element.getOwnerDocument(), replacement.text(), textLocal));
            else { ((Element) texts.item(0)).setTextContent(replacement.text()); for (int i = texts.getLength() - 1; i > 0; i--) texts.item(i).getParentNode().removeChild(texts.item(i)); }
        }
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(element.getOwnerDocument()));
        return OoxmlPackageSupport.write(parts);
    }

    public List<CommentSnapshot> readComments(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        if (!parts.containsKey("word/comments.xml")) return List.of();
        Document comments = OoxmlPackageSupport.parseXml(parts.get("word/comments.xml"));
        Map<String, CommentExData> ext = readCommentsExtended(parts);
        Map<String, String> durableByPara = readCommentsIds(parts);
        Map<String, Instant> dateByDurable = readCommentsExtensible(parts);
        List<MentionSpec> people = readPeople(parts);
        ArrayList<CommentSnapshot> out = new ArrayList<>();
        NodeList list = comments.getElementsByTagNameNS(W, "comment");
        Map<String, Integer> commentIdByPara = new LinkedHashMap<>();
        for (int i = 0; i < list.getLength(); i++) {
            Element comment = (Element) list.item(i);
            int id = Integer.parseInt(attribute(comment, W, "id"));
            Element lastP = last(comment.getElementsByTagNameNS(W, "p"));
            String paraId = lastP == null ? "" : attribute(lastP, W14, "paraId");
            if (!paraId.isBlank()) commentIdByPara.put(paraId, id);
        }
        for (int i = 0; i < list.getLength(); i++) {
            Element comment = (Element) list.item(i);
            int id = Integer.parseInt(attribute(comment, W, "id"));
            Element lastP = last(comment.getElementsByTagNameNS(W, "p"));
            String paraId = lastP == null ? "" : attribute(lastP, W14, "paraId");
            CommentExData ex = ext.getOrDefault(paraId, new CommentExData("", false));
            Integer parentId = ex.parentParaId().isBlank() ? null : commentIdByPara.get(ex.parentParaId());
            String durable = durableByPara.getOrDefault(paraId, "");
            String author = attribute(comment, W, "author");
            Instant at = dateByDurable.getOrDefault(durable, parseInstant(attribute(comment, W, "date")));
            String text = wordText(comment);
            ArrayList<MentionSpec> mentions = new ArrayList<>();
            for (MentionSpec person : people) if (text.contains("@" + person.displayName())) mentions.add(person);
            boolean modern = !paraId.isBlank() && (ext.containsKey(paraId) || !durable.isBlank());
            out.add(new CommentSnapshot("comment:" + id, id, new CommentSpec(author.isBlank() ? "Unknown" : author,
                    clean(attribute(comment, W, "initials")).isBlank() ? initials(author) : attribute(comment, W, "initials"), at, text),
                    modern, parentId, ex.done(), paraId, durable, mentions));
        }
        return List.copyOf(out);
    }

    public byte[] addClassicComment(byte[] bytes, String paragraphLocator, CommentSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Document comments = commentsDocument(parts);
        int id = nextCommentId(comments);
        anchorComment(doc, locateParagraph(doc, paragraphLocator), id);
        comments.getDocumentElement().appendChild(commentElement(comments, id, spec, ""));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/comments.xml", OoxmlPackageSupport.serialize(comments));
        ensureCommentParts(parts, false);
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] addModernComment(byte[] bytes, String paragraphLocator, CommentSpec spec, boolean resolved, MentionSpec mention) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Document comments = commentsDocument(parts);
        int id = nextCommentId(comments);
        String paraId = nextHexId(parts, "para", id + 1);
        String durable = nextDurableId(parts, id + 1);
        anchorComment(doc, locateParagraph(doc, paragraphLocator), id);
        comments.getDocumentElement().appendChild(commentElement(comments, id, withMention(spec, mention), paraId));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/comments.xml", OoxmlPackageSupport.serialize(comments));
        upsertCommentExtension(parts, paraId, "", resolved, durable, spec.at());
        ensurePerson(parts, new MentionSpec(spec.author(), "None", spec.author()));
        if (mention != null) ensurePerson(parts, mention);
        ensureCommentParts(parts, true);
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] addModernReply(byte[] bytes, int parentCommentId, CommentSpec spec, boolean resolved, MentionSpec mention) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        List<CommentSnapshot> existing = readComments(bytes);
        CommentSnapshot parent = existing.stream().filter(c -> c.id() == parentCommentId).findFirst().orElseThrow(() -> new IllegalArgumentException("parent comment not found"));
        if (parent.paraId().isBlank()) throw new IllegalArgumentException("modern reply requires modern parent comment");
        Document comments = commentsDocument(parts);
        int id = nextCommentId(comments);
        String paraId = nextHexId(parts, "para", id + 1);
        String durable = nextDurableId(parts, id + 1);
        comments.getDocumentElement().appendChild(commentElement(comments, id, withMention(spec, mention), paraId));
        parts.put("word/comments.xml", OoxmlPackageSupport.serialize(comments));
        upsertCommentExtension(parts, paraId, parent.paraId(), resolved, durable, spec.at());
        ensurePerson(parts, new MentionSpec(spec.author(), "None", spec.author()));
        if (mention != null) ensurePerson(parts, mention);
        ensureCommentParts(parts, true);
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editComment(byte[] bytes, int commentId, CommentSpec spec, MentionSpec mention) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document comments = commentsDocument(parts);
        Element comment = locateComment(comments, commentId);
        String paraId = commentParaId(comment);
        CommentSpec effective = withMention(spec, mention);
        if (commentContainsRichUnsupportedContent(comment)) throw new IllegalArgumentException("rich/nested comment content requires specialized editor");
        setAttribute(comment, W, "w:author", "author", effective.author());
        setAttribute(comment, W, "w:initials", "initials", effective.initials());
        setAttribute(comment, W, "w:date", "date", effective.at().toString());
        while (comment.getFirstChild() != null) comment.removeChild(comment.getFirstChild());
        Element p = commentParagraph(comments, effective.text(), paraId);
        comment.appendChild(p);
        parts.put("word/comments.xml", OoxmlPackageSupport.serialize(comments));
        if (!paraId.isBlank()) updateCommentExtensibleDate(parts, paraId, effective.at());
        ensurePerson(parts, new MentionSpec(effective.author(), "None", effective.author()));
        if (mention != null) ensurePerson(parts, mention);
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] setCommentResolved(byte[] bytes, int commentId, boolean resolved) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document comments = commentsDocument(parts);
        Element comment = locateComment(comments, commentId);
        String paraId = commentParaId(comment);
        if (paraId.isBlank()) throw new IllegalArgumentException("resolution state requires modern comment metadata");
        Document extended = commentsExtendedDocument(parts);
        Element ex = findByAttribute(extended, W15, "commentEx", W15, "paraId", paraId);
        if (ex == null) throw new IOException("modern comment extension missing for paraId " + paraId);
        setAttribute(ex, W15, "w15:done", "done", resolved ? "1" : "0");
        parts.put("word/commentsExtended.xml", OoxmlPackageSupport.serialize(extended));
        return OoxmlPackageSupport.write(parts);
    }

    public ProtectionSpec readDocumentProtection(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        if (!parts.containsKey("word/settings.xml")) return new ProtectionSpec(ProtectionEdit.NONE, false, false, "", "", "", 0, 0, "", "");
        Document settings = OoxmlPackageSupport.parseXml(parts.get("word/settings.xml"));
        Element p = first(settings.getElementsByTagNameNS(W, "documentProtection"));
        if (p == null) return new ProtectionSpec(ProtectionEdit.NONE, false, false, "", "", "", 0, 0, "", "");
        return new ProtectionSpec(parseProtectionEdit(attribute(p, W, "edit")), on(attribute(p, W, "enforcement")), on(attribute(p, W, "formatting")),
                attribute(p, W, "cryptProviderType"), attribute(p, W, "cryptAlgorithmClass"), attribute(p, W, "cryptAlgorithmType"),
                parseInt(attribute(p, W, "cryptAlgorithmSid"), 0), parseInt(attribute(p, W, "cryptSpinCount"), 0), attribute(p, W, "hash"), attribute(p, W, "salt"));
    }

    public byte[] upsertDocumentProtection(byte[] bytes, ProtectionSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document settings = settingsDocument(parts);
        Element root = settings.getDocumentElement();
        Element existing = firstDirect(root, W, "documentProtection");
        if (spec.edit() == ProtectionEdit.NONE && !spec.enforcement() && !spec.formattingLocked()) {
            if (existing != null) root.removeChild(existing);
        } else {
            Element p = existing == null ? settings.createElementNS(W, "w:documentProtection") : existing;
            if (existing == null) root.insertBefore(p, root.getFirstChild());
            setAttribute(p, W, "w:edit", "edit", protectionEditValue(spec.edit()));
            setAttribute(p, W, "w:enforcement", "enforcement", spec.enforcement() ? "1" : "0");
            setAttribute(p, W, "w:formatting", "formatting", spec.formattingLocked() ? "1" : "0");
            setOptionalAttribute(p, "cryptProviderType", spec.cryptProviderType());
            setOptionalAttribute(p, "cryptAlgorithmClass", spec.cryptAlgorithmClass());
            setOptionalAttribute(p, "cryptAlgorithmType", spec.cryptAlgorithmType());
            setOptionalAttribute(p, "cryptAlgorithmSid", spec.cryptAlgorithmSid() == 0 ? "" : Integer.toString(spec.cryptAlgorithmSid()));
            setOptionalAttribute(p, "cryptSpinCount", spec.cryptSpinCount() == 0 ? "" : Integer.toString(spec.cryptSpinCount()));
            setOptionalAttribute(p, "hash", spec.hash());
            setOptionalAttribute(p, "salt", spec.salt());
        }
        parts.put("word/settings.xml", OoxmlPackageSupport.serialize(settings));
        ensureSettingsRelationshipAndContentType(parts);
        return OoxmlPackageSupport.write(parts);
    }

    public List<RestrictedRangeSnapshot> readRestrictedRanges(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<RestrictedRangeSnapshot> out = new ArrayList<>();
        NodeList starts = doc.getElementsByTagNameNS(W, "permStart");
        for (int i = 0; i < starts.getLength(); i++) {
            Element start = (Element) starts.item(i);
            String id = attribute(start, W, "id");
            Element paragraph = ancestor(start, W, "p");
            if (paragraph == null || findPermissionEnd(doc, id) == null) throw new IOException("restricted-editing permission range incomplete: " + id);
            int pIndex = paragraphIndex(doc, paragraph);
            String group = attribute(start, W, "edGrp");
            if (group.isBlank()) group = attribute(start, W, "ed");
            if (group.isBlank()) group = "everyone";
            out.add(new RestrictedRangeSnapshot("restricted-range:" + id, new RestrictedRangeSpec(id, group, "body/p:" + pIndex)));
        }
        return List.copyOf(out);
    }

    public byte[] upsertRestrictedRange(byte[] bytes, RestrictedRangeSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element paragraph = locateParagraph(doc, spec.paragraphLocator());
        removePermissionRange(doc, spec.id());
        Element start = doc.createElementNS(W, "w:permStart");
        setAttribute(start, W, "w:id", "id", spec.id());
        setAttribute(start, W, "w:edGrp", "edGrp", spec.editorGroup());
        Element end = doc.createElementNS(W, "w:permEnd");
        setAttribute(end, W, "w:id", "id", spec.id());
        Node content = firstParagraphContent(paragraph);
        if (content == null) paragraph.appendChild(start); else paragraph.insertBefore(start, content);
        paragraph.appendChild(end);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] appendRevision(byte[] bytes, String paragraphLocator, RevisionSpec spec, String local, boolean deletionText) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        locateParagraph(doc, paragraphLocator).appendChild(revisionElement(doc, local, spec, deletionText));
        ensureTrackRevisions(parts);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    private static Element revisionElement(Document doc, String local, RevisionSpec spec, boolean deletionText) {
        Element revision = doc.createElementNS(W, "w:" + local);
        setRevisionAttributes(revision, spec.id(), spec.author(), spec.at());
        revision.appendChild(textRunForRevision(doc, spec.text(), deletionText ? "delText" : "t"));
        return revision;
    }

    private static Element textRunForRevision(Document doc, String text, String local) {
        Element run = doc.createElementNS(W, "w:r");
        Element t = doc.createElementNS(W, "w:" + local);
        preserveSpace(t, text);
        t.setTextContent(text);
        run.appendChild(t);
        return run;
    }

    private static Element moveRangeMarker(Document doc, String local, String id, String author) {
        Element e = doc.createElementNS(W, "w:" + local);
        setAttribute(e, W, "w:id", "id", id);
        if (local.endsWith("Start")) {
            setAttribute(e, W, "w:author", "author", author);
            setAttribute(e, W, "w:name", "name", "move-" + id);
        }
        return e;
    }

    private static void setRevisionAttributes(Element element, String id, String author, Instant at) {
        setAttribute(element, W, "w:id", "id", id);
        setAttribute(element, W, "w:author", "author", author);
        setAttribute(element, W, "w:date", "date", at.toString());
    }

    private static void requireKind(RevisionSpec spec, RevisionKind kind) {
        Objects.requireNonNull(spec, "spec");
        if (spec.kind() != kind) throw new IllegalArgumentException("revision kind must be " + kind);
    }

    private static RevisionElementLocated locateRevision(byte[] bytes, String locator) throws IOException {
        if (!locator.matches("revision:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe revision locator: " + locator);
        int wanted = Integer.parseInt(locator.substring("revision:".length()));
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        ArrayList<Element> elements = new ArrayList<>();
        collectRevisionElements(doc.getDocumentElement(), elements);
        if (wanted > elements.size()) throw new IllegalArgumentException("revision not found: " + locator);
        return new RevisionElementLocated(parts, elements.get(wanted - 1));
    }

    private static void collectRevisionElements(Node node, List<Element> out) {
        if (node instanceof Element e && W.equals(e.getNamespaceURI()) && Set.of("ins", "del", "moveFrom", "moveTo", "rPrChange", "pPrChange").contains(e.getLocalName())) out.add(e);
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) collectRevisionElements(child, out);
    }

    private static RevisionKind revisionKind(Element element) {
        return switch (element.getLocalName()) {
            case "ins" -> RevisionKind.INSERTION;
            case "del" -> RevisionKind.DELETION;
            case "moveFrom" -> RevisionKind.MOVE_FROM;
            case "moveTo" -> RevisionKind.MOVE_TO;
            case "rPrChange", "pPrChange" -> RevisionKind.FORMATTING;
            default -> throw new IllegalArgumentException("not a revision element: " + element.getLocalName());
        };
    }

    private static void ensureTrackRevisions(Map<String, byte[]> parts) throws IOException {
        Document settings = settingsDocument(parts);
        if (firstDirect(settings.getDocumentElement(), W, "trackRevisions") == null) settings.getDocumentElement().appendChild(settings.createElementNS(W, "w:trackRevisions"));
        parts.put("word/settings.xml", OoxmlPackageSupport.serialize(settings));
        ensureSettingsRelationshipAndContentType(parts);
    }

    private static CommentSpec withMention(CommentSpec spec, MentionSpec mention) {
        if (mention == null || spec.text().contains("@" + mention.displayName())) return spec;
        return new CommentSpec(spec.author(), spec.initials(), spec.at(), spec.text() + " @" + mention.displayName());
    }

    private static Document commentsDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/comments.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/comments.xml"));
        return newXml("comments", W, "w", Map.of("w14", W14));
    }

    private static Document commentsExtendedDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/commentsExtended.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/commentsExtended.xml"));
        return newXml("commentsEx", W15, "w15", Map.of("w14", W14));
    }

    private static Document commentsIdsDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/commentsIds.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/commentsIds.xml"));
        return newXml("commentsIds", W16CID, "w16cid", Map.of("w14", W14));
    }

    private static Document commentsExtensibleDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/commentsExtensible.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/commentsExtensible.xml"));
        return newXml("commentsExtensible", W16CEX, "w16cex", Map.of());
    }

    private static Document peopleDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/people.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/people.xml"));
        return newXml("people", W15, "w15", Map.of());
    }

    private static Element commentElement(Document comments, int id, CommentSpec spec, String paraId) {
        Element comment = comments.createElementNS(W, "w:comment");
        setAttribute(comment, W, "w:id", "id", Integer.toString(id));
        setAttribute(comment, W, "w:author", "author", spec.author());
        setAttribute(comment, W, "w:initials", "initials", spec.initials());
        setAttribute(comment, W, "w:date", "date", spec.at().toString());
        comment.appendChild(commentParagraph(comments, spec.text(), paraId));
        return comment;
    }

    private static Element commentParagraph(Document doc, String text, String paraId) {
        Element p = doc.createElementNS(W, "w:p");
        if (!paraId.isBlank()) p.setAttributeNS(W14, "w14:paraId", paraId);
        p.appendChild(textRun(doc, text));
        return p;
    }

    private static void anchorComment(Document doc, Element paragraph, int id) {
        Element start = doc.createElementNS(W, "w:commentRangeStart"); setAttribute(start, W, "w:id", "id", Integer.toString(id));
        Element end = doc.createElementNS(W, "w:commentRangeEnd"); setAttribute(end, W, "w:id", "id", Integer.toString(id));
        Element refRun = doc.createElementNS(W, "w:r"); Element ref = doc.createElementNS(W, "w:commentReference"); setAttribute(ref, W, "w:id", "id", Integer.toString(id)); refRun.appendChild(ref);
        Node first = firstParagraphContent(paragraph); if (first == null) paragraph.appendChild(start); else paragraph.insertBefore(start, first);
        paragraph.appendChild(end); paragraph.appendChild(refRun);
    }

    private static void upsertCommentExtension(Map<String, byte[]> parts, String paraId, String parentParaId, boolean done, String durable, Instant at) throws IOException {
        Document ex = commentsExtendedDocument(parts);
        Element ce = findByAttribute(ex, W15, "commentEx", W15, "paraId", paraId);
        if (ce == null) { ce = ex.createElementNS(W15, "w15:commentEx"); ex.getDocumentElement().appendChild(ce); }
        setAttribute(ce, W15, "w15:paraId", "paraId", paraId);
        if (parentParaId.isBlank()) ce.removeAttributeNS(W15, "paraIdParent"); else setAttribute(ce, W15, "w15:paraIdParent", "paraIdParent", parentParaId);
        setAttribute(ce, W15, "w15:done", "done", done ? "1" : "0");
        parts.put("word/commentsExtended.xml", OoxmlPackageSupport.serialize(ex));

        Document ids = commentsIdsDocument(parts);
        Element id = findByAttribute(ids, W16CID, "commentId", W16CID, "paraId", paraId);
        if (id == null) { id = ids.createElementNS(W16CID, "w16cid:commentId"); ids.getDocumentElement().appendChild(id); }
        setAttribute(id, W16CID, "w16cid:paraId", "paraId", paraId);
        setAttribute(id, W16CID, "w16cid:durableId", "durableId", durable);
        parts.put("word/commentsIds.xml", OoxmlPackageSupport.serialize(ids));

        Document extensible = commentsExtensibleDocument(parts);
        Element cex = findByAttribute(extensible, W16CEX, "commentExtensible", W16CEX, "durableId", durable);
        if (cex == null) { cex = extensible.createElementNS(W16CEX, "w16cex:commentExtensible"); extensible.getDocumentElement().appendChild(cex); }
        setAttribute(cex, W16CEX, "w16cex:durableId", "durableId", durable);
        setAttribute(cex, W16CEX, "w16cex:dateUtc", "dateUtc", at.toString());
        parts.put("word/commentsExtensible.xml", OoxmlPackageSupport.serialize(extensible));
    }

    private static void updateCommentExtensibleDate(Map<String, byte[]> parts, String paraId, Instant at) throws IOException {
        String durable = readCommentsIds(parts).getOrDefault(paraId, "");
        if (durable.isBlank()) return;
        Document extensible = commentsExtensibleDocument(parts);
        Element cex = findByAttribute(extensible, W16CEX, "commentExtensible", W16CEX, "durableId", durable);
        if (cex != null) { setAttribute(cex, W16CEX, "w16cex:dateUtc", "dateUtc", at.toString()); parts.put("word/commentsExtensible.xml", OoxmlPackageSupport.serialize(extensible)); }
    }

    private static void ensurePerson(Map<String, byte[]> parts, MentionSpec person) throws IOException {
        Document people = peopleDocument(parts);
        NodeList list = people.getElementsByTagNameNS(W15, "person");
        for (int i = 0; i < list.getLength(); i++) {
            Element existing = (Element) list.item(i);
            if (person.displayName().equals(attribute(existing, W15, "author"))) {
                Element presence = firstDirect(existing, W15, "presenceInfo");
                if (presence == null) { presence = people.createElementNS(W15, "w15:presenceInfo"); existing.appendChild(presence); }
                setAttribute(presence, W15, "w15:providerId", "providerId", person.providerId());
                setAttribute(presence, W15, "w15:userId", "userId", person.userId());
                parts.put("word/people.xml", OoxmlPackageSupport.serialize(people));
                return;
            }
        }
        Element e = people.createElementNS(W15, "w15:person"); setAttribute(e, W15, "w15:author", "author", person.displayName());
        Element presence = people.createElementNS(W15, "w15:presenceInfo"); setAttribute(presence, W15, "w15:providerId", "providerId", person.providerId()); setAttribute(presence, W15, "w15:userId", "userId", person.userId()); e.appendChild(presence); people.getDocumentElement().appendChild(e);
        parts.put("word/people.xml", OoxmlPackageSupport.serialize(people));
    }

    private static boolean commentContainsRichUnsupportedContent(Element comment) {
        for (String local : List.of("tbl", "drawing", "object", "sdt", "oMath", "oMathPara")) {
            if (comment.getElementsByTagNameNS("*", local).getLength() > 0) return true;
        }
        NodeList paragraphs = comment.getElementsByTagNameNS(W, "p");
        return paragraphs.getLength() > 1;
    }

    private static Map<String, CommentExData> readCommentsExtended(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/commentsExtended.xml")) return Map.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("word/commentsExtended.xml"));
        LinkedHashMap<String, CommentExData> out = new LinkedHashMap<>();
        NodeList list = d.getElementsByTagNameNS(W15, "commentEx");
        for (int i = 0; i < list.getLength(); i++) { Element e = (Element) list.item(i); out.put(attribute(e, W15, "paraId"), new CommentExData(attribute(e, W15, "paraIdParent"), on(attribute(e, W15, "done")))); }
        return Map.copyOf(out);
    }

    private static Map<String, String> readCommentsIds(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/commentsIds.xml")) return Map.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("word/commentsIds.xml"));
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        NodeList list = d.getElementsByTagNameNS(W16CID, "commentId");
        for (int i = 0; i < list.getLength(); i++) { Element e = (Element) list.item(i); out.put(attribute(e, W16CID, "paraId"), attribute(e, W16CID, "durableId")); }
        return Map.copyOf(out);
    }

    private static Map<String, Instant> readCommentsExtensible(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/commentsExtensible.xml")) return Map.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("word/commentsExtensible.xml"));
        LinkedHashMap<String, Instant> out = new LinkedHashMap<>();
        NodeList list = d.getElementsByTagNameNS(W16CEX, "commentExtensible");
        for (int i = 0; i < list.getLength(); i++) { Element e = (Element) list.item(i); out.put(attribute(e, W16CEX, "durableId"), parseInstant(attribute(e, W16CEX, "dateUtc"))); }
        return Map.copyOf(out);
    }

    private static List<MentionSpec> readPeople(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/people.xml")) return List.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("word/people.xml"));
        ArrayList<MentionSpec> out = new ArrayList<>();
        NodeList list = d.getElementsByTagNameNS(W15, "person");
        for (int i = 0; i < list.getLength(); i++) {
            Element person = (Element) list.item(i);
            Element presence = firstDirect(person, W15, "presenceInfo");
            out.add(new MentionSpec(attribute(person, W15, "author"), presence == null ? "None" : attribute(presence, W15, "providerId"), presence == null ? attribute(person, W15, "author") : attribute(presence, W15, "userId")));
        }
        return List.copyOf(out);
    }

    private static void ensureCommentParts(Map<String, byte[]> parts, boolean modern) throws IOException {
        ensureDocumentRelationship(parts, COMMENTS_REL, "comments.xml");
        ensureOverrideContentType(parts, "/word/comments.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml");
        if (!modern) return;
        ensureDocumentRelationship(parts, COMMENTS_EXTENDED_REL, "commentsExtended.xml");
        ensureDocumentRelationship(parts, COMMENTS_IDS_REL, "commentsIds.xml");
        ensureDocumentRelationship(parts, COMMENTS_EXTENSIBLE_REL, "commentsExtensible.xml");
        ensureDocumentRelationship(parts, PEOPLE_REL, "people.xml");
        ensureOverrideContentType(parts, "/word/commentsExtended.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml");
        ensureOverrideContentType(parts, "/word/commentsIds.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml");
        ensureOverrideContentType(parts, "/word/commentsExtensible.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml");
        ensureOverrideContentType(parts, "/word/people.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml");
    }

    private static int nextCommentId(Document comments) {
        int max = -1; NodeList list = comments.getElementsByTagNameNS(W, "comment");
        for (int i = 0; i < list.getLength(); i++) max = Math.max(max, parseInt(attribute((Element) list.item(i), W, "id"), -1));
        return max + 1;
    }

    private static String commentParaId(Element comment) { Element p = last(comment.getElementsByTagNameNS(W, "p")); return p == null ? "" : attribute(p, W14, "paraId"); }
    private static Element locateComment(Document comments, int id) { NodeList list = comments.getElementsByTagNameNS(W, "comment"); for (int i = 0; i < list.getLength(); i++) { Element c = (Element) list.item(i); if (Integer.toString(id).equals(attribute(c, W, "id"))) return c; } throw new IllegalArgumentException("comment not found: " + id); }

    private static String nextHexId(Map<String, byte[]> parts, String purpose, int seed) {
        long value = Integer.toUnsignedLong(Objects.hash(purpose, seed, parts.size())); value = (value % 0x7ffffff0L) + 1L; return String.format(Locale.ROOT, "%08X", value);
    }
    private static String nextDurableId(Map<String, byte[]> parts, int seed) { return nextHexId(parts, "durable", seed); }

    private static void ensureSettingsRelationshipAndContentType(Map<String, byte[]> parts) throws IOException {
        ensureDocumentRelationship(parts, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings", "settings.xml");
        ensureOverrideContentType(parts, "/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml");
    }

    private static Document settingsDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/settings.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/settings.xml"));
        return newXml("settings", W, "w", Map.of());
    }

    private static void ensureDocumentRelationship(Map<String, byte[]> parts, String type, String target) throws IOException {
        String name = "word/_rels/document.xml.rels";
        Document rels = parts.containsKey(name) ? OoxmlPackageSupport.parseXml(parts.get(name)) : newXml("Relationships", REL, "", Map.of());
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < list.getLength(); i++) if (type.equals(((Element) list.item(i)).getAttribute("Type"))) { parts.put(name, OoxmlPackageSupport.serialize(rels)); return; }
        Element relationship = rels.createElementNS(REL, "Relationship"); relationship.setAttribute("Id", nextRelationshipId(rels)); relationship.setAttribute("Type", type); relationship.setAttribute("Target", target); rels.getDocumentElement().appendChild(relationship); parts.put(name, OoxmlPackageSupport.serialize(rels));
    }

    private static void ensureOverrideContentType(Map<String, byte[]> parts, String part, String mime) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(parts, "[Content_Types].xml"));
        NodeList overrides = d.getElementsByTagNameNS(CT, "Override");
        for (int i = 0; i < overrides.getLength(); i++) if (part.equals(((Element) overrides.item(i)).getAttribute("PartName"))) { ((Element) overrides.item(i)).setAttribute("ContentType", mime); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d)); return; }
        Element e = d.createElementNS(CT, "Override"); e.setAttribute("PartName", part); e.setAttribute("ContentType", mime); d.getDocumentElement().appendChild(e); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }

    private static String nextRelationshipId(Document rels) { LinkedHashSet<String> ids = new LinkedHashSet<>(); NodeList list = rels.getElementsByTagNameNS(REL, "Relationship"); for (int i = 0; i < list.getLength(); i++) ids.add(((Element) list.item(i)).getAttribute("Id")); int n = 1; while (ids.contains("rId" + n)) n++; return "rId" + n; }

    private static void removePermissionRange(Document doc, String id) {
        for (String local : List.of("permStart", "permEnd")) {
            NodeList nodes = doc.getElementsByTagNameNS(W, local);
            ArrayList<Node> remove = new ArrayList<>();
            for (int i = 0; i < nodes.getLength(); i++) if (id.equals(attribute((Element) nodes.item(i), W, "id"))) remove.add(nodes.item(i));
            for (Node n : remove) n.getParentNode().removeChild(n);
        }
    }

    private static Element findPermissionEnd(Document doc, String id) { NodeList list = doc.getElementsByTagNameNS(W, "permEnd"); for (int i = 0; i < list.getLength(); i++) if (id.equals(attribute((Element) list.item(i), W, "id"))) return (Element) list.item(i); return null; }
    private static Node firstParagraphContent(Element paragraph) { for (Node n = paragraph.getFirstChild(); n != null; n = n.getNextSibling()) if (!(n instanceof Element e && W.equals(e.getNamespaceURI()) && "pPr".equals(e.getLocalName()))) return n; return null; }
    private static int paragraphIndex(Document doc, Element paragraph) { int n = 0; for (Element p : bodyParagraphs(doc)) { n++; if (p == paragraph) return n; } throw new IllegalArgumentException("paragraph not in body"); }

    private static ProtectionEdit parseProtectionEdit(String v) { return switch (clean(v)) { case "readOnly" -> ProtectionEdit.READ_ONLY; case "comments" -> ProtectionEdit.COMMENTS; case "trackedChanges" -> ProtectionEdit.TRACKED_CHANGES; case "forms" -> ProtectionEdit.FORMS; default -> ProtectionEdit.NONE; }; }
    private static String protectionEditValue(ProtectionEdit e) { return switch (e) { case READ_ONLY -> "readOnly"; case COMMENTS -> "comments"; case TRACKED_CHANGES -> "trackedChanges"; case FORMS -> "forms"; case NONE -> "none"; }; }
    private static void setOptionalAttribute(Element e, String local, String value) { if (value == null || value.isBlank()) e.removeAttributeNS(W, local); else setAttribute(e, W, "w:" + local, local, value); }

    private static MailMergeFieldSpec parseMailMerge(String instruction, String display) {
        String clean = clean(instruction); String[] parts = clean.split("\\s+", 3); if (parts.length < 2) throw new IllegalArgumentException("MERGEFIELD name missing"); String switches = parts.length > 2 ? parts[2] : ""; return new MailMergeFieldSpec(parts[1].replace("\"", ""), switches, display);
    }
    private static String mailMergeInstruction(MailMergeFieldSpec spec) { return "MERGEFIELD " + spec.fieldName() + (spec.switches().isBlank() ? "" : " " + spec.switches()); }
    private static String firstToken(String instruction) { String v = clean(instruction); return v.isBlank() ? "" : v.split("\\s+", 2)[0].toUpperCase(Locale.ROOT); }

    private static Map<String, byte[]> requireDocx(byte[] bytes) throws IOException { Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(bytes)); required(parts, "[Content_Types].xml"); required(parts, "word/document.xml"); return parts; }
    private static Document document(Map<String, byte[]> parts) throws IOException { return OoxmlPackageSupport.parseXml(required(parts, "word/document.xml")); }
    private static byte[] required(Map<String, byte[]> parts, String name) throws IOException { byte[] b = parts.get(name); if (b == null) throw new IOException("missing OOXML part: " + name); return b; }

    private static Element locateParagraph(Document doc, String locator) {
        String safe = requireParagraphLocator(locator); int wanted = Integer.parseInt(safe.substring("body/p:".length())); Element body = first(doc.getElementsByTagNameNS(W, "body")); if (body == null) throw new IllegalArgumentException("document body missing"); int n = 0;
        for (Node node = body.getFirstChild(); node != null; node = node.getNextSibling()) if (node instanceof Element e && W.equals(e.getNamespaceURI()) && "p".equals(e.getLocalName()) && ++n == wanted) return e;
        throw new IllegalArgumentException("paragraph locator out of range");
    }
    private static String requireParagraphLocator(String locator) { if (locator == null || !locator.matches("body/p:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe paragraph locator: " + locator); return locator; }
    private static List<Element> bodyParagraphs(Document doc) { Element body = first(doc.getElementsByTagNameNS(W, "body")); ArrayList<Element> out = new ArrayList<>(); if (body != null) for (Node n = body.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && W.equals(e.getNamespaceURI()) && "p".equals(e.getLocalName())) out.add(e); return List.copyOf(out); }

    private static Element textRun(Document doc, String text) { Element run = doc.createElementNS(W, "w:r"); run.appendChild(textNode(doc, text)); return run; }
    private static Element textNode(Document doc, String text) { Element t = doc.createElementNS(W, "w:t"); preserveSpace(t, text); t.setTextContent(text); return t; }
    private static void preserveSpace(Element e, String text) { if (text != null && !text.isEmpty() && (Character.isWhitespace(text.charAt(0)) || Character.isWhitespace(text.charAt(text.length() - 1)))) e.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve"); }
    private static String wordText(Element element) { return textContent(element, W, "t"); }
    private static String textContent(Element element, String ns, String local) { if (element == null) return ""; NodeList list = element.getElementsByTagNameNS(ns, local); StringBuilder b = new StringBuilder(); for (int i = 0; i < list.getLength(); i++) b.append(Objects.requireNonNullElse(list.item(i).getTextContent(), "")); return b.toString(); }

    private static boolean fieldCharType(Element run, String type) { NodeList list = run.getElementsByTagNameNS(W, "fldChar"); for (int i = 0; i < list.getLength(); i++) if (type.equals(attribute((Element) list.item(i), W, "fldCharType"))) return true; return false; }
    private static List<Element> directChildren(Element parent, String ns, String local) { ArrayList<Element> out = new ArrayList<>(); if (parent != null) for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) out.add(e); return List.copyOf(out); }
    private static Element firstDirect(Element parent, String ns, String local) { if (parent == null) return null; for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static void removeDirect(Element parent, String ns, String local) { for (Node n = parent.getFirstChild(); n != null;) { Node next = n.getNextSibling(); if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) parent.removeChild(n); n = next; } }
    private static Element ancestor(Node node, String ns, String local) { for (Node p = node.getParentNode(); p != null; p = p.getParentNode()) if (p instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static Element first(NodeList list) { return list == null || list.getLength() == 0 ? null : (Element) list.item(0); }
    private static Element last(NodeList list) { return list == null || list.getLength() == 0 ? null : (Element) list.item(list.getLength() - 1); }
    private static Element findByAttribute(Document d, String ns, String local, String ans, String attr, String value) { NodeList list = d.getElementsByTagNameNS(ns, local); for (int i = 0; i < list.getLength(); i++) { Element e = (Element) list.item(i); if (value.equals(attribute(e, ans, attr))) return e; } return null; }

    private static String attribute(Element e, String ns, String local) { if (e == null) return ""; String v = e.getAttributeNS(ns, local); if (v.isBlank()) v = e.getAttribute(local); return clean(v); }
    private static void setAttribute(Element e, String ns, String qname, String local, String value) { e.setAttributeNS(ns, qname, Objects.requireNonNullElse(value, "")); if (!e.hasAttributeNS(ns, local)) e.setAttributeNS(ns, qname, Objects.requireNonNullElse(value, "")); }
    private static void setBooleanProperty(Document doc, Element parent, String local, boolean value) { removeDirect(parent, W, local); if (value) parent.appendChild(doc.createElementNS(W, "w:" + local)); }
    private static boolean on(String v) { String x = clean(v).toLowerCase(Locale.ROOT); return Set.of("1", "true", "on").contains(x); }
    private static int parseInt(String v, int fallback) { try { return Integer.parseInt(clean(v)); } catch (NumberFormatException ex) { return fallback; } }
    private static Instant parseInstant(String v) { try { return Instant.parse(clean(v)); } catch (RuntimeException ex) { return Instant.EPOCH; } }
    private static String clean(String v) { return Objects.requireNonNullElse(v, "").strip(); }
    private static String token(String v, String label, int max) { String x = clean(v); if (x.isBlank() || x.length() > max || !x.matches("[A-Za-z0-9_.:-]+")) throw new IllegalArgumentException(label + " invalid"); return x; }
    private static String numericId(String v, String label) { String x = clean(v); if (!x.matches("[0-9]+") || x.length() > 10) throw new IllegalArgumentException(label + " invalid"); return x; }
    private static String boundedText(String v, String label, int max) { String x = clean(v); if (x.isBlank() || x.length() > max) throw new IllegalArgumentException(label + " required"); return x; }
    private static String initials(String author) { String a = clean(author); if (a.isBlank()) return "U"; StringBuilder b = new StringBuilder(); for (String part : a.split("\\s+")) if (!part.isBlank()) b.append(Character.toUpperCase(part.charAt(0))); return b.substring(0, Math.min(4, b.length())); }

    private static Document newXml(String local, String ns, String prefix, Map<String, String> namespaces) throws IOException {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance(); f.setNamespaceAware(true); f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); f.setFeature("http://xml.org/sax/features/external-general-entities", false); f.setFeature("http://xml.org/sax/features/external-parameter-entities", false); f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false); f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            Document d = f.newDocumentBuilder().newDocument(); String q = prefix == null || prefix.isBlank() ? local : prefix + ":" + local; Element root = d.createElementNS(ns, q); if (prefix == null || prefix.isBlank()) root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns", ns); else root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:" + prefix, ns); for (Map.Entry<String, String> e : namespaces.entrySet()) root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:" + e.getKey(), e.getValue()); d.appendChild(root); return d;
        } catch (Exception ex) { throw new IOException("cannot create XML document", ex); }
    }

    private record CommentExData(String parentParaId, boolean done) {}
    private record RevisionElementLocated(Map<String, byte[]> parts, Element element) {}
}
