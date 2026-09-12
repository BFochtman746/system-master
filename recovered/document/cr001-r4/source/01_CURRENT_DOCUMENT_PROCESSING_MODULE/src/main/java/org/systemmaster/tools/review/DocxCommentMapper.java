package org.systemmaster.tools.review;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.DocumentFormat;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Adds a native WordprocessingML comment anchored to a whole paragraph. */
public final class DocxCommentMapper {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String COMMENTS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";

    public record Result(byte[] bytes, NativeReviewMappingReceipt receipt) {
        public Result { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public Result addParagraphComment(byte[] source, ReviewAnchor anchor, String comment, String author, String initials, Instant at) throws IOException {
        Objects.requireNonNull(source); Objects.requireNonNull(anchor); Objects.requireNonNull(at);
        if (!"word/document.xml".equals(anchor.nativePart()) || !anchor.locator().matches("paragraph:[1-9][0-9]*")) throw new IllegalArgumentException("DOCX comment requires paragraph anchor");
        String text = requireText(comment, "comment", 32_000), actor = requireText(author, "author", 256), init = requireText(initials, "initials", 16);
        LinkedHashMap<String,byte[]> entries = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        if (entries.containsKey("word/comments.xml")) throw new UnsupportedOperationException("portable mapper currently adds first comments part only");
        Document document = OoxmlPackageSupport.parseXml(required(entries, "word/document.xml"));
        NodeList ps = document.getElementsByTagNameNS(W, "p");
        int index = Integer.parseInt(anchor.locator().substring("paragraph:".length())) - 1;
        if (index < 0 || index >= ps.getLength()) throw new IllegalArgumentException("paragraph anchor outside document");
        Element p = (Element) ps.item(index);
        String id = "0";
        Element start = document.createElementNS(W, "w:commentRangeStart"); start.setAttributeNS(W, "w:id", id);
        Element end = document.createElementNS(W, "w:commentRangeEnd"); end.setAttributeNS(W, "w:id", id);
        Element refRun = document.createElementNS(W, "w:r"); Element ref = document.createElementNS(W, "w:commentReference"); ref.setAttributeNS(W, "w:id", id); refRun.appendChild(ref);
        Node insertion = firstContent(p); if (insertion == null) p.appendChild(start); else p.insertBefore(start, insertion);
        p.appendChild(end); p.appendChild(refRun);
        entries.put("word/document.xml", OoxmlPackageSupport.serialize(document));

        String comments = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:comments xmlns:w=\"" + W + "\"><w:comment w:id=\"0\" w:author=\"" + xml(actor)
                + "\" w:date=\"" + xml(at.toString()) + "\" w:initials=\"" + xml(init) + "\"><w:p><w:r><w:t>" + xml(text)
                + "</w:t></w:r></w:p></w:comment></w:comments>";
        entries.put("word/comments.xml", comments.getBytes(StandardCharsets.UTF_8));
        ensureRelationship(entries);
        ensureContentType(entries);
        byte[] result = OoxmlPackageSupport.write(entries);
        return new Result(result, new NativeReviewMappingReceipt(DocumentFormat.DOCX, "WORDPROCESSINGML_COMMENT",
                OoxmlPackageSupport.sha256(source), OoxmlPackageSupport.sha256(result),
                List.of("word/document.xml", "word/comments.xml", "word/_rels/document.xml.rels", "[Content_Types].xml"), List.of("WHOLE_PARAGRAPH_COMMENT_ANCHOR")));
    }

    private static Node firstContent(Element p) { for (Node n=p.getFirstChild();n!=null;n=n.getNextSibling()) if (!(n instanceof Element e && W.equals(e.getNamespaceURI()) && "pPr".equals(e.getLocalName()))) return n; return null; }
    private static void ensureRelationship(Map<String,byte[]> entries) throws IOException {
        String part="word/_rels/document.xml.rels"; Document d=OoxmlPackageSupport.parseXml(required(entries,part));
        NodeList list=d.getDocumentElement().getElementsByTagNameNS("*","Relationship"); for(int i=0;i<list.getLength();i++) if(COMMENTS_REL.equals(((Element)list.item(i)).getAttribute("Type"))) return;
        Element r=d.createElementNS(REL,"Relationship"); r.setAttribute("Id",nextRid(d)); r.setAttribute("Type",COMMENTS_REL); r.setAttribute("Target","comments.xml"); d.getDocumentElement().appendChild(r); entries.put(part,OoxmlPackageSupport.serialize(d));
    }
    private static void ensureContentType(Map<String,byte[]> entries) throws IOException {
        Document d=OoxmlPackageSupport.parseXml(required(entries,"[Content_Types].xml")); NodeList list=d.getDocumentElement().getElementsByTagNameNS("*","Override");
        for(int i=0;i<list.getLength();i++) if("/word/comments.xml".equals(((Element)list.item(i)).getAttribute("PartName"))) return;
        Element o=d.createElementNS(d.getDocumentElement().getNamespaceURI(),"Override"); o.setAttribute("PartName","/word/comments.xml"); o.setAttribute("ContentType","application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"); d.getDocumentElement().appendChild(o); entries.put("[Content_Types].xml",OoxmlPackageSupport.serialize(d));
    }
    private static String nextRid(Document d){int n=1;java.util.HashSet<String>ids=new java.util.HashSet<>();NodeList l=d.getDocumentElement().getElementsByTagNameNS("*","Relationship");for(int i=0;i<l.getLength();i++)ids.add(((Element)l.item(i)).getAttribute("Id"));while(ids.contains("rId"+n))n++;return "rId"+n;}
    private static byte[] required(Map<String,byte[]> e,String n)throws IOException{byte[]b=e.get(n);if(b==null)throw new IOException("missing OOXML part: "+n);return b;}
    private static String requireText(String v,String n,int max){if(v==null||v.isBlank()||v.length()>max)throw new IllegalArgumentException(n+" required");return v;}
    private static String xml(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");}
}
