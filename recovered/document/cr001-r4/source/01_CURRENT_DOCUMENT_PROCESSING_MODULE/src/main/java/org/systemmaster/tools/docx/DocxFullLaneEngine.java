package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.common.OoxmlMutationPlan;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Portable full-lane WordprocessingML operations with native-host boundaries left explicit. */
public final class DocxFullLaneEngine {
    private static final String W="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    public record Diagnostic(String code,String severity,String detail) {}
    public record Inventory(int paragraphs,int tables,int headings,int hyperlinks,int bookmarks,int comments,int revisions,int equations,int drawings,int contentControls,int footnotes,int endnotes,boolean macros,boolean signatures,boolean protection,List<String> customXmlParts) {}
    public record Verification(boolean reopenable,boolean semanticStable,List<Diagnostic> diagnostics,String packageDigest) {}
    public record Diff(List<String> beforeParagraphs,List<String> afterParagraphs,int changedParagraphCount) {}

    public byte[] createDocument(List<String> paragraphs) throws IOException {
        Map<String,byte[]>e=new LinkedHashMap<>();
        e.put("[Content_Types].xml",("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>").getBytes(StandardCharsets.UTF_8));
        e.put("_rels/.rels",("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>").getBytes(StandardCharsets.UTF_8));
        StringBuilder b=new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\""+W+"\"><w:body>"); if(paragraphs!=null)for(String p:paragraphs)b.append("<w:p><w:r><w:t>").append(xml(p)).append("</w:t></w:r></w:p>"); b.append("<w:sectPr/></w:body></w:document>");e.put("word/document.xml",b.toString().getBytes(StandardCharsets.UTF_8));e.put("word/_rels/document.xml.rels","<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>".getBytes(StandardCharsets.UTF_8));return OoxmlPackageSupport.write(e);
    }

    public byte[] appendParagraph(byte[] bytes,String text,String style) throws IOException {Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);Element body=(Element)d.getElementsByTagNameNS(W,"body").item(0);Element p=d.createElementNS(W,"w:p");if(style!=null&&!style.isBlank()){Element pPr=d.createElementNS(W,"w:pPr");Element ps=d.createElementNS(W,"w:pStyle");ps.setAttributeNS(W,"w:val",style);pPr.appendChild(ps);p.appendChild(pPr);}Element r=d.createElementNS(W,"w:r");Element t=d.createElementNS(W,"w:t");t.setTextContent(text);r.appendChild(t);p.appendChild(r);Node sect=d.getElementsByTagNameNS(W,"sectPr").item(0);if(sect!=null&&sect.getParentNode()==body)body.insertBefore(p,sect);else body.appendChild(p);e.put("word/document.xml",OoxmlPackageSupport.serialize(d));return OoxmlPackageSupport.write(e);}

    public byte[] addTable(byte[] bytes,List<List<String>>rows) throws IOException {Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);Element body=(Element)d.getElementsByTagNameNS(W,"body").item(0);Element tbl=d.createElementNS(W,"w:tbl");for(List<String>row:rows){Element tr=d.createElementNS(W,"w:tr");for(String value:row){Element tc=d.createElementNS(W,"w:tc");Element p=d.createElementNS(W,"w:p");Element r=d.createElementNS(W,"w:r");Element t=d.createElementNS(W,"w:t");t.setTextContent(value);r.appendChild(t);p.appendChild(r);tc.appendChild(p);tr.appendChild(tc);}tbl.appendChild(tr);}Node sect=d.getElementsByTagNameNS(W,"sectPr").item(0);if(sect!=null&&sect.getParentNode()==body)body.insertBefore(tbl,sect);else body.appendChild(tbl);e.put("word/document.xml",OoxmlPackageSupport.serialize(d));return OoxmlPackageSupport.write(e);}

    public byte[] addBookmark(byte[] bytes,int paragraphIndex,String name) throws IOException {Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);NodeList ps=d.getElementsByTagNameNS(W,"p");if(paragraphIndex<0||paragraphIndex>=ps.getLength())throw new IllegalArgumentException("paragraphIndex");Element p=(Element)ps.item(paragraphIndex);String id=Integer.toString(nextBookmarkId(d));Element start=d.createElementNS(W,"w:bookmarkStart");start.setAttributeNS(W,"w:id",id);start.setAttributeNS(W,"w:name",name);Element end=d.createElementNS(W,"w:bookmarkEnd");end.setAttributeNS(W,"w:id",id);p.insertBefore(start,p.getFirstChild());p.appendChild(end);e.put("word/document.xml",OoxmlPackageSupport.serialize(d));return OoxmlPackageSupport.write(e);}

    public byte[] addSimpleField(byte[]bytes,String instruction,String display) throws IOException {Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);Element body=(Element)d.getElementsByTagNameNS(W,"body").item(0);Element p=d.createElementNS(W,"w:p");Element f=d.createElementNS(W,"w:fldSimple");f.setAttributeNS(W,"w:instr",instruction);Element r=d.createElementNS(W,"w:r");Element t=d.createElementNS(W,"w:t");t.setTextContent(display==null?"":display);r.appendChild(t);f.appendChild(r);p.appendChild(f);Node sect=d.getElementsByTagNameNS(W,"sectPr").item(0);if(sect!=null)body.insertBefore(p,sect);else body.appendChild(p);e.put("word/document.xml",OoxmlPackageSupport.serialize(d));return OoxmlPackageSupport.write(e);}

    public byte[] replaceAdvancedPart(byte[]bytes,String partName,byte[]replacement,String expectedPartDigest)throws IOException{return OoxmlPackageSupport.replacePart(bytes,partName,replacement,expectedPartDigest);}
    public byte[] applyAdvancedPlan(byte[] bytes, OoxmlMutationPlan plan) throws IOException { return OoxmlPackageSupport.applyMutationPlan(bytes,plan); }

    public Inventory inventory(byte[]bytes)throws IOException{Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);List<String>custom=e.keySet().stream().filter(x->x.startsWith("customXml/")).sorted().toList();return new Inventory(count(d,"p"),count(d,"tbl"),countHeadings(d),countExternalRels(e,"hyperlink"),count(d,"bookmarkStart"),partCount(e,"word/comments"),count(d,"ins")+count(d,"del")+count(d,"moveFrom")+count(d,"moveTo"),count(d,"oMath")+count(d,"oMathPara"),count(d,"drawing")+count(d,"pict"),count(d,"sdt"),partCount(e,"word/footnotes"),partCount(e,"word/endnotes"),e.containsKey("word/vbaProject.bin"),e.keySet().stream().anyMatch(x->x.startsWith("_xmlsignatures/")),count(d,"documentProtection")>0,custom);}

    public List<Diagnostic> accessibility(byte[]bytes)throws IOException{Map<String,byte[]>e=OoxmlPackageSupport.read(bytes);Document d=doc(e);List<Diagnostic>x=new ArrayList<>();if(countHeadings(d)==0)x.add(new Diagnostic("NO_HEADINGS","WARN","document has no heading styles"));NodeList drawings=d.getElementsByTagNameNS(W,"drawing");if(drawings.getLength()>0){String xml=new String(required(e,"word/document.xml"),StandardCharsets.UTF_8);if(!xml.contains("descr=")&&!xml.contains("title="))x.add(new Diagnostic("DRAWING_ALT_TEXT_UNOBSERVED","WARN","drawings exist without observed alt text attributes"));}if(!d.getDocumentElement().hasAttributeNS("http://www.w3.org/XML/1998/namespace","lang"))x.add(new Diagnostic("DOCUMENT_LANGUAGE_UNOBSERVED","INFO","document root language not declared"));return List.copyOf(x);}

    public Verification verify(byte[]bytes){List<Diagnostic>d=new ArrayList<>();try{DocxPackageEngine.Inspection a=new DocxPackageEngine().inspect(bytes);byte[]round=OoxmlPackageSupport.write(OoxmlPackageSupport.read(bytes));DocxPackageEngine.Inspection b=new DocxPackageEngine().inspect(round);boolean stable=a.semanticDigest().equals(b.semanticDigest());if(!stable)d.add(new Diagnostic("SEMANTIC_ROUNDTRIP_DRIFT","ERROR","semantic digest changed"));return new Verification(true,stable,List.copyOf(d),OoxmlPackageSupport.sha256(bytes));}catch(Exception ex){d.add(new Diagnostic("DOCX_INVALID","ERROR",ex.getClass().getSimpleName()));return new Verification(false,false,List.copyOf(d),OoxmlPackageSupport.sha256(bytes));}}

    public Diff diff(byte[]a,byte[]b)throws IOException{List<String>x=new DocxPackageEngine().inspect(a).paragraphs();List<String>y=new DocxPackageEngine().inspect(b).paragraphs();int max=Math.max(x.size(),y.size()),changed=0;for(int i=0;i<max;i++){String l=i<x.size()?x.get(i):null,r=i<y.size()?y.get(i):null;if(!java.util.Objects.equals(l,r))changed++;}return new Diff(x,y,changed);}

    private static Document doc(Map<String,byte[]>e)throws IOException{return OoxmlPackageSupport.parseXml(required(e,"word/document.xml"));}
    private static int count(Document d,String local){return d.getElementsByTagNameNS("*",local).getLength();}
    private static int countHeadings(Document d){int n=0;NodeList s=d.getElementsByTagNameNS(W,"pStyle");for(int i=0;i<s.getLength();i++){String v=((Element)s.item(i)).getAttributeNS(W,"val");if(v.toLowerCase().startsWith("heading"))n++;}return n;}
    private static int partCount(Map<String,byte[]>e,String prefix){return (int)e.keySet().stream().filter(x->x.startsWith(prefix)).count();}
    private static int countExternalRels(Map<String,byte[]>e,String token)throws IOException{int n=0;for(var z:e.entrySet())if(z.getKey().endsWith(".rels")){Document d=OoxmlPackageSupport.parseXml(z.getValue());NodeList l=d.getDocumentElement().getElementsByTagNameNS("*","Relationship");for(int i=0;i<l.getLength();i++){Element r=(Element)l.item(i);if("External".equalsIgnoreCase(r.getAttribute("TargetMode"))&&r.getAttribute("Type").toLowerCase().contains(token))n++;}}return n;}
    private static int nextBookmarkId(Document d){int max=0;NodeList l=d.getElementsByTagNameNS(W,"bookmarkStart");for(int i=0;i<l.getLength();i++)try{max=Math.max(max,Integer.parseInt(((Element)l.item(i)).getAttributeNS(W,"id")));}catch(NumberFormatException ignored){}return max+1;}
    private static byte[] required(Map<String,byte[]>e,String n)throws IOException{byte[]b=e.get(n);if(b==null)throw new IOException("missing OOXML part: "+n);return b;}
    private static String xml(String s){return (s==null?"":s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;");}
}
