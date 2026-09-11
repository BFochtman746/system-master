package org.systemmaster.tools.review;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.DocumentFormat;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Adds an interoperable classic PresentationML slide comment. Modern-comment migration remains a later fidelity lane. */
public final class PptxClassicCommentMapper {
    private static final String P = "http://schemas.openxmlformats.org/presentationml/2006/main";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String COMMENTS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
    private static final String AUTHORS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors";

    public record Result(byte[] bytes, NativeReviewMappingReceipt receipt) {
        public Result { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public Result addComment(byte[] source, int slideNumber, String text, String author, String initials, Instant at) throws IOException {
        Objects.requireNonNull(source); Objects.requireNonNull(at);
        if (slideNumber < 1 || slideNumber > 10_000) throw new IllegalArgumentException("slide number");
        String body = requireText(text, "comment", 32_000), actor = requireText(author, "author", 256), init = requireText(initials, "initials", 16);
        LinkedHashMap<String,byte[]> entries = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        String slidePart = "ppt/slides/slide" + slideNumber + ".xml";
        if (!entries.containsKey(slidePart)) throw new IllegalArgumentException("slide not found: " + slideNumber);
        String commentsPart = "ppt/comments/comment" + slideNumber + ".xml";
        if (entries.containsKey(commentsPart)) throw new UnsupportedOperationException("portable classic mapper currently adds first comment part only");

        ensureAuthor(entries, actor, init);
        ensurePresentationAuthorsRelationship(entries);
        ensureSlideCommentsRelationship(entries, slideNumber);
        ensureContentTypes(entries, commentsPart);
        String commentXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<p:cmLst xmlns:p=\"" + P + "\"><p:cm authorId=\"0\" dt=\"" + xml(at.toString()) + "\" idx=\"1\">"
                + "<p:pos x=\"100000\" y=\"100000\"/><p:text>" + xml(body) + "</p:text></p:cm></p:cmLst>";
        entries.put(commentsPart, commentXml.getBytes(StandardCharsets.UTF_8));
        byte[] result = OoxmlPackageSupport.write(entries);
        return new Result(result, new NativeReviewMappingReceipt(DocumentFormat.PPTX, "PRESENTATIONML_CLASSIC_COMMENT",
                OoxmlPackageSupport.sha256(source), OoxmlPackageSupport.sha256(result),
                List.of(commentsPart, "ppt/commentAuthors.xml", "ppt/slides/_rels/slide" + slideNumber + ".xml.rels", "ppt/_rels/presentation.xml.rels", "[Content_Types].xml"),
                List.of("CLASSIC_COMMENT_COMPATIBILITY_PATH", "MODERN_POWERPOINT_COMMENT_MAPPING_PENDING")));
    }

    private static void ensureAuthor(Map<String,byte[]> entries, String author, String initials) {
        if (!entries.containsKey("ppt/commentAuthors.xml")) {
            String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><p:cmAuthorLst xmlns:p=\"" + P + "\"><p:cmAuthor id=\"0\" name=\"" + xml(author)
                    + "\" initials=\"" + xml(initials) + "\" lastIdx=\"1\" clrIdx=\"0\"/></p:cmAuthorLst>";
            entries.put("ppt/commentAuthors.xml", xml.getBytes(StandardCharsets.UTF_8));
        }
    }
    private static void ensurePresentationAuthorsRelationship(Map<String,byte[]> entries) throws IOException {
        String part = "ppt/_rels/presentation.xml.rels";
        Document d = OoxmlPackageSupport.parseXml(required(entries, part));
        if (!hasRelationshipType(d, AUTHORS_REL)) addRelationship(d, nextRid(d), AUTHORS_REL, "commentAuthors.xml");
        entries.put(part, OoxmlPackageSupport.serialize(d));
    }
    private static void ensureSlideCommentsRelationship(Map<String,byte[]> entries, int slideNumber) throws IOException {
        String part = "ppt/slides/_rels/slide" + slideNumber + ".xml.rels";
        Document d;
        if (entries.containsKey(part)) d = OoxmlPackageSupport.parseXml(entries.get(part));
        else {
            d = OoxmlPackageSupport.parseXml(("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"" + REL + "\"/>").getBytes(StandardCharsets.UTF_8));
        }
        if (!hasRelationshipType(d, COMMENTS_REL)) addRelationship(d, nextRid(d), COMMENTS_REL, "../comments/comment" + slideNumber + ".xml");
        entries.put(part, OoxmlPackageSupport.serialize(d));
    }
    private static void ensureContentTypes(Map<String,byte[]> entries, String commentsPart) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(entries, "[Content_Types].xml"));
        addOverrideIfMissing(d, "/ppt/commentAuthors.xml", "application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml");
        addOverrideIfMissing(d, "/" + commentsPart, "application/vnd.openxmlformats-officedocument.presentationml.comments+xml");
        entries.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }
    private static void addOverrideIfMissing(Document d, String partName, String contentType) {
        NodeList list = d.getDocumentElement().getElementsByTagNameNS("*", "Override");
        for (int i = 0; i < list.getLength(); i++) if (partName.equals(((Element) list.item(i)).getAttribute("PartName"))) return;
        Element o = d.createElementNS(d.getDocumentElement().getNamespaceURI(), "Override"); o.setAttribute("PartName", partName); o.setAttribute("ContentType", contentType); d.getDocumentElement().appendChild(o);
    }
    private static boolean hasRelationshipType(Document d, String type) { NodeList list=d.getDocumentElement().getElementsByTagNameNS("*","Relationship"); for(int i=0;i<list.getLength();i++) if(type.equals(((Element)list.item(i)).getAttribute("Type"))) return true; return false; }
    private static String nextRid(Document d) { int n=1; java.util.HashSet<String> ids=new java.util.HashSet<>(); NodeList list=d.getDocumentElement().getElementsByTagNameNS("*","Relationship"); for(int i=0;i<list.getLength();i++) ids.add(((Element)list.item(i)).getAttribute("Id")); while(ids.contains("rId"+n)) n++; return "rId"+n; }
    private static void addRelationship(Document d,String id,String type,String target) { Element r=d.createElementNS(REL,"Relationship"); r.setAttribute("Id",id); r.setAttribute("Type",type); r.setAttribute("Target",target); d.getDocumentElement().appendChild(r); }
    private static byte[] required(Map<String,byte[]> entries,String name) throws IOException { byte[] b=entries.get(name); if(b==null) throw new IOException("missing OOXML part: "+name); return b; }
    private static String requireText(String v,String n,int max){if(v==null||v.isBlank()||v.length()>max)throw new IllegalArgumentException(n+" required");return v;}
    private static String xml(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");}
}
