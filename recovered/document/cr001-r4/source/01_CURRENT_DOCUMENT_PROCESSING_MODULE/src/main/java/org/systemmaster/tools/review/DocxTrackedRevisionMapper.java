package org.systemmaster.tools.review;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.DocumentFormat;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Conservative native WordprocessingML tracked-revision mapper for whole-paragraph replacement proposals. */
public final class DocxTrackedRevisionMapper {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    public record Result(byte[] bytes, NativeReviewMappingReceipt receipt) {
        public Result { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public Result applyReplacement(byte[] source, ReviewChange change, String author, Instant at) throws IOException {
        Objects.requireNonNull(source, "source"); Objects.requireNonNull(change, "change"); Objects.requireNonNull(at, "at");
        if (change.type() != ReviewChange.Type.REPLACE) throw new IllegalArgumentException("DOCX native tracked mapper requires REPLACE change");
        if (!"word/document.xml".equals(change.anchor().nativePart()) || !change.anchor().locator().matches("paragraph:[1-9][0-9]*")) {
            throw new IllegalArgumentException("DOCX tracked mapper requires paragraph anchor");
        }
        String actor = requireText(author, "author", 256);
        Map<String,byte[]> entries = new java.util.LinkedHashMap<>(OoxmlPackageSupport.read(source));
        byte[] docBytes = entries.get("word/document.xml");
        if (docBytes == null) throw new IOException("missing word/document.xml");
        Document doc = OoxmlPackageSupport.parseXml(docBytes);
        NodeList paragraphs = doc.getElementsByTagNameNS(W, "p");
        int index = Integer.parseInt(change.anchor().locator().substring("paragraph:".length())) - 1;
        if (index < 0 || index >= paragraphs.getLength()) throw new IllegalArgumentException("paragraph anchor outside document");
        Element paragraph = (Element) paragraphs.item(index);
        String observed = text(paragraph);
        if (!observed.equals(change.beforeText())) throw new IllegalStateException("review precondition text mismatch");

        Node pPr = firstDirectChild(paragraph, W, "pPr");
        ArrayList<Node> remove = new ArrayList<>();
        for (Node n = paragraph.getFirstChild(); n != null; n = n.getNextSibling()) if (n != pPr) remove.add(n);
        for (Node n : remove) paragraph.removeChild(n);

        String revisionId = Integer.toString(Math.floorMod(change.changeId().hashCode(), Integer.MAX_VALUE));
        Element del = doc.createElementNS(W, "w:del"); setW(del, "id", revisionId); setW(del, "author", actor); setW(del, "date", at.toString());
        Element delRun = doc.createElementNS(W, "w:r"); Element delText = doc.createElementNS(W, "w:delText");
        preserveSpace(delText, change.beforeText()); delText.setTextContent(change.beforeText()); delRun.appendChild(delText); del.appendChild(delRun);
        paragraph.appendChild(del);

        Element ins = doc.createElementNS(W, "w:ins"); setW(ins, "id", Integer.toString(Math.floorMod(revisionId.hashCode() + 1, Integer.MAX_VALUE)));
        setW(ins, "author", actor); setW(ins, "date", at.toString());
        Element insRun = doc.createElementNS(W, "w:r"); Element text = doc.createElementNS(W, "w:t");
        preserveSpace(text, change.afterText()); text.setTextContent(change.afterText()); insRun.appendChild(text); ins.appendChild(insRun);
        paragraph.appendChild(ins);

        entries.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        byte[] result = OoxmlPackageSupport.write(entries);
        NativeReviewMappingReceipt receipt = new NativeReviewMappingReceipt(DocumentFormat.DOCX, "WORDPROCESSINGML_TRACKED_REVISION",
                OoxmlPackageSupport.sha256(source), OoxmlPackageSupport.sha256(result), List.of("word/document.xml"),
                List.of("WHOLE_PARAGRAPH_REVISION", "RUN_LEVEL_FORMATTING_WITHIN_REPLACED_PARAGRAPH_NOT_PRESERVED"));
        return new Result(result, receipt);
    }

    private static String text(Element paragraph) {
        StringBuilder b = new StringBuilder();
        NodeList texts = paragraph.getElementsByTagNameNS(W, "t"); for (int i = 0; i < texts.getLength(); i++) b.append(texts.item(i).getTextContent());
        NodeList dels = paragraph.getElementsByTagNameNS(W, "delText"); for (int i = 0; i < dels.getLength(); i++) b.append(dels.item(i).getTextContent());
        return b.toString();
    }
    private static Node firstDirectChild(Element parent, String ns, String local) { for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return n; return null; }
    private static void setW(Element e, String local, String value) { e.setAttributeNS(W, "w:" + local, value); }
    private static void preserveSpace(Element e, String value) { if (!value.isEmpty() && (Character.isWhitespace(value.charAt(0)) || Character.isWhitespace(value.charAt(value.length() - 1)))) e.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve"); }
    private static String requireText(String value, String name, int max) { if (value == null || value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " required"); return value; }
}
