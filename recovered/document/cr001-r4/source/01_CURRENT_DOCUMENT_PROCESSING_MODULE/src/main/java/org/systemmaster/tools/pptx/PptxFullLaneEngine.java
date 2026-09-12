package org.systemmaster.tools.pptx;

import org.systemmaster.tools.common.OoxmlMutationPlan;
import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Portable headless PowerPoint/PPTX lane engine. */
public final class PptxFullLaneEngine {
    public record SlideSpec(String title, List<String> bullets, String notes) { public SlideSpec { bullets=bullets==null?List.of():List.copyOf(bullets); } }
    public record Verification(boolean reopenable, boolean semanticStable, List<String> diagnostics) {}
    public record Diff(int changedSlideCount, int changedTextCount) {}
    public record AccessibilityDiagnostic(String severity,String code,String message) {}

    public byte[] createPresentation(String title,List<SlideSpec> slides) throws IOException {
        if(slides==null||slides.isEmpty()) throw new IllegalArgumentException("slides empty");
        LinkedHashMap<String,byte[]> e=new LinkedHashMap<>();
        e.put("[Content_Types].xml",contentTypes(slides.size()).getBytes(StandardCharsets.UTF_8));
        e.put("_rels/.rels",rootRels().getBytes(StandardCharsets.UTF_8));
        e.put("docProps/core.xml",core(title).getBytes(StandardCharsets.UTF_8));
        e.put("ppt/presentation.xml",presentation(slides.size()).getBytes(StandardCharsets.UTF_8));
        e.put("ppt/_rels/presentation.xml.rels",presentationRels(slides.size()).getBytes(StandardCharsets.UTF_8));
        for(int i=0;i<slides.size();i++){
            int n=i+1; SlideSpec s=slides.get(i);
            e.put("ppt/slides/slide"+n+".xml",slideXml(s).getBytes(StandardCharsets.UTF_8));
            e.put("ppt/slides/_rels/slide"+n+".xml.rels",emptyRelationships().getBytes(StandardCharsets.UTF_8));
            if(s.notes()!=null&&!s.notes().isBlank()) e.put("ppt/notesSlides/notesSlide"+n+".xml",notesXml(s.notes()).getBytes(StandardCharsets.UTF_8));
        }
        return OoxmlPackageSupport.write(e);
    }
    public PptxPackageEngine.Inspection inspect(byte[] pptx) throws IOException { return new PptxPackageEngine().inspect(pptx); }
    public byte[] addSlide(byte[] pptx,SlideSpec slide) throws IOException {
        Map<String,byte[]> e=new LinkedHashMap<>(OoxmlPackageSupport.read(pptx));
        int next=inspect(pptx).slides().size()+1;
        e.put("ppt/slides/slide"+next+".xml",slideXml(slide).getBytes(StandardCharsets.UTF_8));
        e.put("ppt/slides/_rels/slide"+next+".xml.rels",emptyRelationships().getBytes(StandardCharsets.UTF_8));
        if(slide.notes()!=null&&!slide.notes().isBlank()) e.put("ppt/notesSlides/notesSlide"+next+".xml",notesXml(slide.notes()).getBytes(StandardCharsets.UTF_8));
        e.put("[Content_Types].xml",contentTypes(next).getBytes(StandardCharsets.UTF_8));
        e.put("ppt/presentation.xml",presentation(next).getBytes(StandardCharsets.UTF_8));
        e.put("ppt/_rels/presentation.xml.rels",presentationRels(next).getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(e);
    }
    public byte[] replaceText(byte[] pptx,String from,String to) throws IOException {
        if(from==null||from.isEmpty()) throw new IllegalArgumentException("from");
        Map<String,byte[]> e=new LinkedHashMap<>(OoxmlPackageSupport.read(pptx)); int hits=0;
        for(String name:new ArrayList<>(e.keySet())) if(name.matches("ppt/(slides|notesSlides)/.*\\.xml")) {String xml=new String(e.get(name),StandardCharsets.UTF_8); if(xml.contains(escape(from))||xml.contains(from)){String repl=xml.replace(escape(from),escape(to)).replace(from,escape(to)); if(!repl.equals(xml)){OoxmlPackageSupport.parseXml(repl.getBytes(StandardCharsets.UTF_8)); e.put(name,repl.getBytes(StandardCharsets.UTF_8)); hits++;}}}
        if(hits==0) throw new IllegalStateException("no PPTX text match"); return OoxmlPackageSupport.write(e);
    }
    public byte[] editNotes(byte[] pptx,int slideIndex,String notes) throws IOException {Map<String,byte[]> e=new LinkedHashMap<>(OoxmlPackageSupport.read(pptx)); if(slideIndex<1)throw new IllegalArgumentException("slideIndex"); e.put("ppt/notesSlides/notesSlide"+slideIndex+".xml",notesXml(notes).getBytes(StandardCharsets.UTF_8)); return OoxmlPackageSupport.write(e);}
    public byte[] addHyperlink(byte[] pptx,int slideIndex,String url) throws IOException {Map<String,byte[]> e=new LinkedHashMap<>(OoxmlPackageSupport.read(pptx)); String rel="ppt/slides/_rels/slide"+slideIndex+".xml.rels"; String xml="<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\""+escape(url)+"\" TargetMode=\"External\"/></Relationships>"; e.put(rel,xml.getBytes(StandardCharsets.UTF_8)); return OoxmlPackageSupport.write(e);}
    public byte[] addMediaPart(byte[] pptx,String mediaName,byte[] content) throws IOException {Map<String,byte[]> e=new LinkedHashMap<>(OoxmlPackageSupport.read(pptx)); String safe=OoxmlPackageSupport.safeName("ppt/media/"+mediaName); if(e.containsKey(safe)) throw new IllegalStateException("media exists"); e.put(safe,content.clone()); return OoxmlPackageSupport.write(e);}
    public byte[] applyAdvancedPlan(byte[] pptx,OoxmlMutationPlan plan) throws IOException { return OoxmlPackageSupport.applyMutationPlan(pptx,plan); }
    public byte[] replaceAdvancedPart(byte[] pptx,String part,byte[] content,String expectedPartSha256) throws IOException { return OoxmlPackageSupport.replacePart(pptx,part,content,expectedPartSha256); }
    public Verification verify(byte[] pptx){try{var a=inspect(pptx);var round=inspect(OoxmlPackageSupport.write(OoxmlPackageSupport.read(pptx)));return new Verification(!a.slides().isEmpty(),a.slides().size()==round.slides().size(),List.of());}catch(Exception e){return new Verification(false,false,List.of(e.getClass().getSimpleName()+":"+e.getMessage()));}}
    public Diff diff(byte[] before,byte[] after) throws IOException {var b=inspect(before);var a=inspect(after);int slide=Math.abs(a.slides().size()-b.slides().size());int text=0;int n=Math.min(a.slides().size(),b.slides().size());for(int i=0;i<n;i++) if(!a.slides().get(i).texts().equals(b.slides().get(i).texts())) {slide++; text++;}return new Diff(slide,text);} 
    public List<AccessibilityDiagnostic> accessibility(byte[] pptx) throws IOException {ArrayList<AccessibilityDiagnostic> out=new ArrayList<>();for(var s:inspect(pptx).slides()) if(s.texts().isEmpty()) out.add(new AccessibilityDiagnostic("WARN","EMPTY_SLIDE","Slide "+s.index()+" has no text")); else if(s.texts().getFirst().isBlank()) out.add(new AccessibilityDiagnostic("WARN","MISSING_TITLE","Slide "+s.index()+" may lack title")); return List.copyOf(out);} 
    public List<String> diagnose(byte[] pptx) throws IOException {var i=inspect(pptx);ArrayList<String> d=new ArrayList<>();if(i.slides().isEmpty())d.add("ERROR:NO_SLIDES"); if(!i.activeContent().isEmpty())d.add("WARN:ACTIVE_CONTENT_PRESENT"); if(!i.externalTargets().isEmpty())d.add("WARN:EXTERNAL_TARGETS_PRESENT"); return List.copyOf(d);} 

    private static String rootRels(){return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>";}
    private static String emptyRelationships(){return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>";}
    private static String core(String title){return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>"+escape(title)+"</dc:title></cp:coreProperties>";}
    private static String contentTypes(int count){StringBuilder sb=new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>");for(int i=1;i<=count;i++){sb.append("<Override PartName=\"/ppt/slides/slide").append(i).append(".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>");}sb.append("</Types>");return sb.toString();}
    private static String presentation(int count){StringBuilder ids=new StringBuilder();for(int i=1;i<=count;i++) ids.append("<p:sldId id=\"").append(255+i).append("\" r:id=\"rId").append(i).append("\"/>");return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:sldIdLst>"+ids+"</p:sldIdLst></p:presentation>";}
    private static String presentationRels(int count){StringBuilder rels=new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");for(int i=1;i<=count;i++)rels.append("<Relationship Id=\"rId").append(i).append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide").append(i).append(".xml\"/>");return rels.append("</Relationships>").toString();}
    private static String slideXml(SlideSpec s){
        String title=s.title()==null?"":s.title();
        StringBuilder body=new StringBuilder();
        for(String b:s.bullets()) body.append(textRun(b));
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                +"<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">"
                +"<p:cSld><p:spTree>"
                +"<p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
                +"<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
                +textBox(2,"Title",762000,457200,10668000,1143000,title,true)
                +textBox(3,"Body",914400,1828800,10363200,4114800,body.toString(),false)
                +"</p:spTree></p:cSld></p:sld>";
    }
    private static String textBox(int id,String name,long x,long y,long cx,long cy,String content,boolean title){
        String runs=title?styledTextRun(content,3200,true):content;
        return "<p:sp><p:nvSpPr><p:cNvPr id=\""+id+"\" name=\""+escape(name)+"\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>"
                +"<p:spPr><a:xfrm><a:off x=\""+x+"\" y=\""+y+"\"/><a:ext cx=\""+cx+"\" cy=\""+cy+"\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>"
                +"<p:txBody><a:bodyPr wrap=\"square\"/><a:lstStyle/>"+runs+"</p:txBody></p:sp>";
    }
    private static String styledTextRun(String s,int sizeHundredths,boolean bold){return "<a:p><a:r><a:rPr sz=\""+sizeHundredths+"\" b=\""+(bold?"1":"0")+"\"/><a:t>"+escape(s)+"</a:t></a:r></a:p>";}
    private static String notesXml(String s){return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><p:notes xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>"+textRun(s)+"</p:txBody></p:sp></p:spTree></p:cSld></p:notes>";}
    private static String textRun(String s){return styledTextRun(s,1800,false);}
    private static String escape(String s){return (s==null?"":s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
}
