package org.systemmaster.tools.pptx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Passive PPTX/PPTM package inspector. Active content is never executed. */
public final class PptxPackageEngine {
    public record Slide(int index,String partName,List<String> texts,int relationshipCount) {}
    public record Inspection(List<Slide> slides,List<String> notes,List<String> hyperlinks,List<String> mediaParts,List<String> activeContent,List<String> externalTargets,List<String> entryNames,String packageSha256) {}
    private static final Pattern TARGET=Pattern.compile("Target=\"([^\"]+)\"");
    private static final Pattern EXTERNAL=Pattern.compile("TargetMode=\"External\"");

    public Inspection inspect(byte[] packageBytes) throws IOException {
        Map<String,byte[]> entries=OoxmlPackageSupport.read(packageBytes);
        List<Slide> slides=new ArrayList<>();
        List<String> notes=new ArrayList<>();
        List<String> hyperlinks=new ArrayList<>();
        List<String> media=new ArrayList<>();
        List<String> active=new ArrayList<>();
        List<String> external=new ArrayList<>();
        List<String> names=new ArrayList<>(entries.keySet());
        names.sort(String::compareTo);
        int idx=1;
        for(String name:names){
            if(name.matches("ppt/slides/slide[0-9]+\\.xml")){
                Document d=OoxmlPackageSupport.parseXml(entries.get(name));
                slides.add(new Slide(idx++,name,texts(d),relationshipCount(entries,"ppt/slides/_rels/"+name.substring("ppt/slides/".length())+".rels")));
            } else if(name.matches("ppt/notesSlides/notesSlide[0-9]+\\.xml")) {
                notes.addAll(texts(OoxmlPackageSupport.parseXml(entries.get(name))));
            }
            if(name.startsWith("ppt/media/")) media.add(name);
            if(name.equals("ppt/vbaProject.bin")||name.contains("activeX")||name.contains("embeddings/")||name.endsWith(".bin")) active.add(name);
            if(name.endsWith(".rels")) inspectRelationships(new String(entries.get(name),StandardCharsets.UTF_8),hyperlinks,external);
        }
        return new Inspection(List.copyOf(slides),List.copyOf(notes),List.copyOf(hyperlinks),List.copyOf(media),List.copyOf(active),List.copyOf(external),List.copyOf(names),OoxmlPackageSupport.sha256(packageBytes));
    }
    private static void inspectRelationships(String rels,List<String> hyperlinks,List<String> external){Matcher m=TARGET.matcher(rels);while(m.find()){String target=m.group(1);if(target.startsWith("http://")||target.startsWith("https://")||target.startsWith("mailto:"))hyperlinks.add(target); if(EXTERNAL.matcher(rels.substring(Math.max(0,m.start()-160),Math.min(rels.length(),m.end()+160))).find())external.add(target);}}
    private static int relationshipCount(Map<String,byte[]> entries,String relPart){return entries.containsKey(relPart)?1:0;}
    static List<String> texts(Document doc){ArrayList<String> out=new ArrayList<>();NodeList list=doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main","t");for(int i=0;i<list.getLength();i++){String s=list.item(i).getTextContent();if(s!=null&&!s.isBlank())out.add(s);}return out;}
}
