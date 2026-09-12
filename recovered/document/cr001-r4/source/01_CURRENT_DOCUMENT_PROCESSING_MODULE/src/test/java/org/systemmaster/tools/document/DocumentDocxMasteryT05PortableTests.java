package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.spine.DocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.DocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxDrawingChartMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxTableImageMasteryEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T05 portable semantic + governed-spine qualification. */
public final class DocumentDocxMasteryT05PortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T23:45:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T05 = t05Capabilities();
    private static final byte[] PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=");
    private static final byte[] SVG = ("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"#4472C4\"/><circle cx=\"50\" cy=\"50\" r=\"25\" fill=\"#FFFFFF\"/></svg>").getBytes(StandardCharsets.UTF_8);
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testImageStylingSvgIcons();
        testShapesTextBoxesWordArtGroups();
        testChartsSeriesData();
        testGovernedSpine();
        testNegativeCases();
        check(T05.size() == 60, "T05 owns exactly 60 capabilities");
        System.out.println("DOCUMENT_DOCX_MASTERY_T05_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T05.size());
    }

    private static void testImageStylingSvgIcons() throws Exception {
        byte[] source = preserved(new DocxFullLaneEngine().createDocument(List.of("Image host", "SVG host", "Icon host", "SVG alias host")));
        DocxTableImageMasteryEngine t04 = new DocxTableImageMasteryEngine();
        source = t04.insertFloatingImage(source, "body/p:1", new DocxTableImageMasteryEngine.ImageSpec(PNG, "png", 914400, 914400, "Raster", "Raster title", "Raster alt"), new DocxTableImageMasteryEngine.FloatingPlacement(1000, 2000, "column", "paragraph", "square"));
        DocxDrawingChartMasteryEngine engine = new DocxDrawingChartMasteryEngine();
        source = engine.styleImage(source, "body/p:1/drawing-image:1", new DocxDrawingChartMasteryEngine.ImageStyle(new DocxDrawingChartMasteryEngine.Crop(1000, 2000, 3000, 4000), "tight", 3000L, 4000L, "margin", "page", "Revised title", "Revised alt", false));
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot image = engine.readImageStyles(source).get(0);
        check(image.crop().left() == 1000 && image.crop().bottom() == 4000, "image crop READ/EXTRACT round-trips");
        check("tight".equals(image.wrap()), "image wrap READ/EXTRACT round-trips");
        check(image.xEmu() == 3000 && image.yEmu() == 4000, "image position/anchor READ/EXTRACT round-trips");
        check("margin".equals(image.horizontalRelativeFrom()) && "page".equals(image.verticalRelativeFrom()), "image anchor relatives round-trip");
        check("Revised title".equals(image.title()) && "Revised alt".equals(image.altText()), "image alt/title semantic edit round-trips");
        check(!image.decorative(), "image decorative semantic state is explicit");

        source = engine.insertSvg(source, "body/p:2", new DocxDrawingChartMasteryEngine.SvgSpec(SVG, 1200000, 900000, "Vector", "Vector title", "Vector alt", false));
        source = engine.insertIcon(source, "body/p:3", new DocxDrawingChartMasteryEngine.SvgSpec(SVG, 500000, 500000, "Check", "Icon title", "Icon alt", true));
        source = cloneDrawingRun(source, "body/p:2", "body/p:4", "blip");
        List<DocxDrawingChartMasteryEngine.ImageStyleSnapshot> images = engine.readImageStyles(source);
        check(images.stream().anyMatch(i -> "svg".equals(i.mediaKind()) && "Vector alt".equals(i.altText())), "SVG CREATE/READ uses native SVG media part");
        check(images.stream().anyMatch(i -> "icon".equals(i.mediaKind()) && "Icon alt".equals(i.altText())), "icon CREATE/READ has explicit icon semantics");
        check(OoxmlPackageSupport.read(source).keySet().stream().anyMatch(k -> k.endsWith(".svg")), "SVG media preserved as SVG rather than rasterized");
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot svgBefore = images.stream().filter(i -> i.locator().equals("body/p:2/drawing-image:1")).findFirst().orElseThrow();
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot svgAliasBefore = images.stream().filter(i -> i.locator().equals("body/p:4/drawing-image:1")).findFirst().orElseThrow();
        check(svgBefore.targetPart().equals(svgAliasBefore.targetPart()), "fixture proves two SVG drawings share one media part");
        byte[] revisedSvg = ("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"#70AD47\"/></svg>").getBytes(StandardCharsets.UTF_8);
        source = engine.replaceSvgBytes(source, svgBefore.locator(), revisedSvg, false);
        images = engine.readImageStyles(source);
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot svgAfter = images.stream().filter(i -> i.locator().equals("body/p:2/drawing-image:1")).findFirst().orElseThrow();
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot svgAliasAfter = images.stream().filter(i -> i.locator().equals("body/p:4/drawing-image:1")).findFirst().orElseThrow();
        check(!svgAfter.targetPart().equals(svgAliasAfter.targetPart()), "SVG MASTER uses copy-on-write for shared media");
        check(java.util.Arrays.equals(revisedSvg, OoxmlPackageSupport.read(source).get(svgAfter.targetPart())), "targeted SVG receives replacement bytes");
        check(java.util.Arrays.equals(SVG, OoxmlPackageSupport.read(source).get(svgAliasAfter.targetPart())), "untargeted shared SVG alias preserves original bytes");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t05.xml"), "image/SVG operations preserve unrelated OPC part");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element raster = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && "raster".equals(e.semantic().properties().get("mediaKind"))).findFirst().orElseThrow();
        check("1000".equals(raster.semantic().properties().get("crop.left")), "CDG-2 extracts structured crop");
        check("tight".equals(raster.semantic().properties().get("wrap")), "CDG-2 extracts structured wrap");
        check("Revised alt".equals(raster.accessibility().alternativeText()), "CDG-2 extracts image alt text");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && "svg".equals(e.semantic().properties().get("mediaKind"))), "CDG-2 distinguishes SVG image semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && "icon".equals(e.semantic().properties().get("mediaKind"))), "CDG-2 distinguishes icon semantics");
    }

    private static void testShapesTextBoxesWordArtGroups() throws Exception {
        byte[] source = preserved(new DocxFullLaneEngine().createDocument(List.of("Shape host", "Text host", "WordArt host", "Group host")));
        DocxDrawingChartMasteryEngine engine = new DocxDrawingChartMasteryEngine();
        source = engine.insertShape(source, "body/p:1", shape("roundRect", "Shape text", "D9EAF7", "4472C4", ""));
        source = engine.insertTextBox(source, "body/p:2", shape("rect", "Text box body", "FFFFFF", "808080", ""));
        source = engine.insertWordArt(source, "body/p:3", shape("rect", "Word Art", "F4B183", "C65911", "textArchUp"));
        List<DocxDrawingChartMasteryEngine.ShapeSnapshot> shapes = engine.readShapes(source);
        check(shapes.size() == 3, "shape/textbox/WordArt READ enumerates standalone drawing objects");
        check("roundRect".equals(shapes.get(0).preset()) && "Shape text".equals(shapes.get(0).text()), "shape geometry/text EXTRACT round-trips");
        check(shapes.get(1).textBox() && "Text box body".equals(shapes.get(1).text()), "text-box native semantics round-trip");
        check("textArchUp".equals(shapes.get(2).wordArtPreset()), "WordArt warp semantics round-trip");
        source = engine.editShape(source, 1, shape("ellipse", "Edited shape", "C6E0B4", "548235", ""), false);
        shapes = engine.readShapes(source);
        check("ellipse".equals(shapes.get(0).preset()) && "Edited shape".equals(shapes.get(0).text()), "shape MASTER edits native preset/text");

        DocxDrawingChartMasteryEngine.GroupSpec group = new DocxDrawingChartMasteryEngine.GroupSpec(List.of(shape("rect", "One", "DDEBF7", "5B9BD5", ""), shape("ellipse", "Two", "E2F0D9", "70AD47", "")), 3000000, 1500000);
        source = engine.insertGroup(source, "body/p:4", group);
        List<DocxDrawingChartMasteryEngine.GroupSnapshot> groups = engine.readGroups(source);
        check(groups.size() == 1 && groups.get(0).childCount() == 2, "drawing-group CREATE/READ extracts child membership");
        source = engine.replaceGroup(source, 1, new DocxDrawingChartMasteryEngine.GroupSpec(List.of(shape("triangle", "Three", "FFF2CC", "BF9000", "")), 2500000, 1200000));
        groups = engine.readGroups(source);
        check(groups.get(0).childCount() == 1, "drawing-group MASTER replaces scoped group semantics");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t05.xml"), "drawing-object operations preserve unrelated OPC part");

        CanonicalDocumentGraphV2 graph = project(source);
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SHAPE && "ellipse".equals(e.semantic().properties().get("preset"))), "CDG-2 extracts native shape preset");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TEXT_FRAME && e.text().contains("Text box body")), "CDG-2 extracts text-box semantics");
        check(graph.elements().stream().anyMatch(e -> "wordart".equals(e.semantic().role()) && "textArchUp".equals(e.semantic().properties().get("wordArtPreset"))), "CDG-2 extracts WordArt semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.DIAGRAM && "drawing-group".equals(e.semantic().role()) && "1".equals(e.semantic().properties().get("childCount"))), "CDG-2 extracts drawing-group semantics");
    }

    private static void testChartsSeriesData() throws Exception {
        byte[] source = preserved(new DocxFullLaneEngine().createDocument(List.of("Chart host", "Chart alias host")));
        DocxDrawingChartMasteryEngine engine = new DocxDrawingChartMasteryEngine();
        DocxDrawingChartMasteryEngine.ChartSpec chart = chart("bar", "Quarterly Revenue", List.of(
                new DocxDrawingChartMasteryEngine.ChartSeries("North", List.of("Q1", "Q2", "Q3"), List.of(10.0, 15.0, 18.0)),
                new DocxDrawingChartMasteryEngine.ChartSeries("South", List.of("Q1", "Q2", "Q3"), List.of(8.0, 12.0, 17.0))));
        source = engine.insertChart(source, "body/p:1", chart);
        source = cloneDrawingRun(source, "body/p:1", "body/p:2", "chart");
        List<DocxDrawingChartMasteryEngine.ChartSnapshot> charts = engine.readCharts(source);
        check(charts.size() == 2, "chart CREATE/READ produces native chart references");
        check(charts.get(0).chartPart().equals(charts.get(1).chartPart()), "fixture proves two chart drawings share one chart part");
        check("bar".equals(charts.get(0).type()) && "Quarterly Revenue".equals(charts.get(0).title()), "chart type/title EXTRACT round-trips");
        check(charts.get(0).series().size() == 2, "chart series READ/EXTRACT preserves multiple series");
        check(charts.get(0).series().get(1).values().get(2).equals(17.0), "chart numeric data EXTRACT round-trips");
        source = engine.editChart(source, charts.get(0).locator(), chart("line", "Revenue Trend", List.of(new DocxDrawingChartMasteryEngine.ChartSeries("All", List.of("Q1", "Q2", "Q3"), List.of(18.0, 27.0, 35.0)))));
        charts = engine.readCharts(source);
        check("line".equals(charts.get(0).type()) && "Revenue Trend".equals(charts.get(0).title()), "chart MASTER edits native chart type/title");
        check(charts.get(0).series().size() == 1 && charts.get(0).series().get(0).values().get(2).equals(35.0), "chart series/data MASTER replaces target data");
        check(!charts.get(0).chartPart().equals(charts.get(1).chartPart()), "chart MASTER copy-on-write detaches targeted shared chart part");
        check("bar".equals(charts.get(1).type()) && "Quarterly Revenue".equals(charts.get(1).title()), "untargeted chart alias preserves original native chart semantics");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t05.xml"), "chart operations preserve unrelated OPC part");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element c = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CHART && "line".equals(e.semantic().properties().get("type"))).findFirst().orElseThrow();
        check("line".equals(c.semantic().properties().get("type")), "CDG-2 extracts chart type");
        check("Revenue Trend".equals(c.semantic().properties().get("title")), "CDG-2 extracts chart title");
        check("1".equals(c.semantic().properties().get("seriesCount")), "CDG-2 extracts chart series count");
        check(c.data().values().stream().anyMatch(v -> v.contains("All\tQ3\t35.0")), "CDG-2 extracts structured chart series/category/value data");
    }

    private static void testGovernedSpine() throws Exception {
        byte[] source = preserved(new DocxFullLaneEngine().createDocument(List.of("Governed chart", "Governed image")));
        CanonicalDocumentGraphV2 graph = project(source);
        String p1 = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Governed chart").id();
        Map<String,String> params = new LinkedHashMap<>();
        params.put("docx.action","INSERT_CHART"); params.put("chart.type","bar"); params.put("chart.title","Spine Chart"); params.put("chart.widthEmu","5000000"); params.put("chart.heightEmu","3000000"); params.put("chart.seriesCount","1"); params.put("chart.series.1.name","S"); params.put("chart.series.1.categories","A;B"); params.put("chart.series.1.values","1;2");
        DocumentSpineResult result = execute(source,p1,DocumentOperationContract.Type.INSERT_CONTENT,params,Set.of("word/document.xml","word/_rels/document.xml.rels","[Content_Types].xml","word/charts/*"),"chart");
        assertProved(result,"chart");
        check(new DocxDrawingChartMasteryEngine().readCharts(result.resultBytes()).size()==1,"governed spine creates native chart");

        graph=project(result.resultBytes());
        String p2=element(graph,CanonicalDocumentGraphV2.ElementType.PARAGRAPH,"Governed image").id();
        Map<String,String> image=new LinkedHashMap<>(); image.put("docx.action","INSERT_FLOATING_IMAGE");image.put("image.base64",Base64.getEncoder().encodeToString(PNG));image.put("image.extension","png");image.put("image.widthEmu","914400");image.put("image.heightEmu","914400");image.put("image.name","Spine image");image.put("image.altText","Before alt");image.put("image.xEmu","10");image.put("image.yEmu","20");image.put("image.wrap","square");
        result=execute(result.resultBytes(),p2,DocumentOperationContract.Type.INSERT_CONTENT,image,Set.of("word/document.xml","word/_rels/document.xml.rels","[Content_Types].xml","word/media/*"),"image");
        graph=project(result.resultBytes());String imageId=graph.elements().stream().filter(e->e.type()==CanonicalDocumentGraphV2.ElementType.IMAGE).findFirst().orElseThrow().id();
        Map<String,String> style=new LinkedHashMap<>();style.put("docx.action","STYLE_IMAGE");style.put("image.crop.left","500");style.put("image.crop.top","600");style.put("image.crop.right","700");style.put("image.crop.bottom","800");style.put("image.wrap","through");style.put("image.xEmu","30");style.put("image.yEmu","40");style.put("image.altText","After alt");
        result=execute(result.resultBytes(),imageId,DocumentOperationContract.Type.FORMAT,style,Set.of("word/document.xml"),"style-image");assertProved(result,"style-image");
        DocxDrawingChartMasteryEngine.ImageStyleSnapshot snap=new DocxDrawingChartMasteryEngine().readImageStyles(result.resultBytes()).stream().filter(i->"raster".equals(i.mediaKind())).findFirst().orElseThrow();
        check(snap.crop().left()==500&&"through".equals(snap.wrap())&&"After alt".equals(snap.altText()),"governed spine styles image crop/wrap/alt");
    }

    private static void testNegativeCases() throws Exception {
        expectIllegal(() -> new DocxDrawingChartMasteryEngine.Crop(-1,0,0,0), "negative crop fails closed");
        expectIllegal(() -> new DocxDrawingChartMasteryEngine.ImageStyle(DocxDrawingChartMasteryEngine.Crop.none(),"bogus",null,null,"","",null,null,null), "unknown wrap fails closed");
        expectIllegal(() -> new DocxDrawingChartMasteryEngine.ChartSeries("bad",List.of("A"),List.of(1.0,2.0)), "misaligned chart series fails closed");
        expectIllegal(() -> chart("scatter","bad",List.of(new DocxDrawingChartMasteryEngine.ChartSeries("S",List.of("A"),List.of(1.0)))), "unsupported chart type fails closed");
        byte[] source=new DocxFullLaneEngine().createDocument(List.of("x"));
        expectAny(() -> new DocxDrawingChartMasteryEngine().styleImage(source,"body/p:1/drawing-image:1",new DocxDrawingChartMasteryEngine.ImageStyle(DocxDrawingChartMasteryEngine.Crop.none(),"",null,null,"","",null,null,null)), "missing drawing target fails closed");
        check(OoxmlPackageSupport.read(source).containsKey("word/document.xml"),"negative cases do not corrupt source package");
    }

    private static DocxDrawingChartMasteryEngine.ShapeSpec shape(String preset,String text,String fill,String line,String warp){return new DocxDrawingChartMasteryEngine.ShapeSpec(preset,1800000,900000,fill,line,text,warp);}
    private static DocxDrawingChartMasteryEngine.ChartSpec chart(String type,String title,List<DocxDrawingChartMasteryEngine.ChartSeries> series){return new DocxDrawingChartMasteryEngine.ChartSpec(type,title,5000000,3000000,series);}
    private static byte[] cloneDrawingRun(byte[] source,String fromLocator,String toLocator,String kind)throws Exception{Map<String,byte[]>parts=new LinkedHashMap<>(OoxmlPackageSupport.read(source));Document d=OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));Element from=paragraph(d,fromLocator);Element to=paragraph(d,toLocator);Element run=null;for(Node n=from.getFirstChild();n!=null;n=n.getNextSibling()){if(n instanceof Element e&&"r".equals(e.getLocalName())){boolean match="chart".equals(kind)?e.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/chart","chart").getLength()>0:e.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main","blip").getLength()>0;if(match){run=e;break;}}}if(run==null)throw new IllegalStateException("source drawing run missing");to.appendChild(run.cloneNode(true));parts.put("word/document.xml",OoxmlPackageSupport.serialize(d));return OoxmlPackageSupport.write(parts);}
    private static Element paragraph(Document d,String locator){int index=Integer.parseInt(locator.substring("body/p:".length()));Element body=(Element)d.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main","body").item(0);int count=0;for(Node n=body.getFirstChild();n!=null;n=n.getNextSibling())if(n instanceof Element e&&"p".equals(e.getLocalName())&&++count==index)return e;throw new IllegalArgumentException("paragraph not found");}
    private static byte[] preserved(byte[] source)throws Exception{Map<String,byte[]>p=new LinkedHashMap<>(OoxmlPackageSupport.read(source));p.put("customXml/t05.xml","<t05 preserve=\"yes\"/>".getBytes(StandardCharsets.UTF_8));return OoxmlPackageSupport.write(p);}
    private static CanonicalDocumentGraphV2 project(byte[] bytes)throws Exception{return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX,bytes);}
    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph,CanonicalDocumentGraphV2.ElementType type,String text){return graph.elements().stream().filter(e->e.type()==type&&e.text().contains(text)).findFirst().orElseThrow();}

    private static DocumentSpineResult execute(byte[] source,String targetId,DocumentOperationContract.Type type,Map<String,String> parameters,Set<String> expectedParts,String label)throws Exception{Path root=Files.createTempDirectory("docx-t05-"+label+"-");try{CanonicalDocumentGraphV2 graph=project(source);DocumentOperationContract op=new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1,"docx-mastery-t05-"+label,graph.sourceSha256(),graph.semanticDigest(),type,List.of(DocumentSelector.node(targetId)),"DOCUMENT-DOCX-MASTERY-T05 "+label,parameters,DocumentOperationContract.Risk.REVERSIBLE_EDIT,graph.sourceSha256(),expectedParts,DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,false,List.of(),false,EnumSet.noneOf(DocumentProofReceipt.Gate.class));DocumentSpineJob job=new DocumentSpineJob(UuidV7.create().toString(),UuidV7.create().toString(),label+"-source",label+"-result",label+".docx",DocumentFormat.DOCX.mediaType(),DocumentSpineMode.MASTER,DocumentFormat.DOCX,DocumentSpinePublicationClass.VERIFIED_DRAFT,allCapabilities(),"DOCUMENT-DOCX-MASTERY-T05","qualification",FIXED);DocumentSpineExecutionPlan plan=new DocumentSpineExecutionPlan(job.jobId(),job.mode(),op,Set.of(targetId),allCapabilities(),List.of());return spine(root).executeExisting(job,new ByteArrayInputStream(source),plan);}finally{deleteTree(root);}}
    private static UniversalDocumentSpine spine(Path root)throws Exception{FilePlatform008Repository repo=new FilePlatform008Repository(root.resolve("meta"));GovernedArtifactGateway gateway=new GovernedArtifactGateway(root.resolve("bytes"),ArtifactIntakePolicy.conservative(64L*1024*1024),repo,CLOCK);DocumentSpineCheckpointStore cp=new FileDocumentSpineCheckpointStore(root.resolve("checkpoints"));DocumentSpineVersionStore vs=new FileDocumentSpineVersionStore(root.resolve("versions"));DocumentSpineProofService proofs=new DocumentSpineProofService(new DocumentProcessingService(),new SyntheticRenderer(),CLOCK);return new UniversalDocumentSpine(gateway,cp,vs,proofs,CLOCK);}
    private static void assertProved(DocumentSpineResult r,String label){check(r.publication()!=null&&r.publication().publicationClass()==DocumentSpinePublicationClass.VERIFIED_DRAFT,label+" published verified draft");check(r.preservation()!=null&&r.preservation().pass(),label+" preservation passes");check(r.finalization()!=null&&r.finalization().missing().isEmpty(),label+" proof complete");}
    private static Set<String> allCapabilities(){LinkedHashSet<String>o=new LinkedHashSet<>(T05);for(int i=1;i<=21;i++)o.add("UDM-SPINE-"+String.format(java.util.Locale.ROOT,"%04d",i));for(int i=34;i<=54;i++)o.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));o.add("UDM-FOUNDATION-0064");for(int i=76;i<=85;i++)o.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(o);}
    private static Set<String> t05Capabilities(){LinkedHashSet<String>o=new LinkedHashSet<>();for(int i=256;i<=315;i++)o.add("UDM-DOCX-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(o);}
    private static void check(boolean value,String message){if(!value)throw new AssertionError(message);assertions++;}
    private static void expectIllegal(Throwing action,String message)throws Exception{boolean failed=false;try{action.run();}catch(IllegalArgumentException e){failed=true;}check(failed,message);}
    private static void expectAny(Throwing action,String message)throws Exception{boolean failed=false;try{action.run();}catch(Exception e){failed=true;}check(failed,message);}
    private static void deleteTree(Path root)throws Exception{if(root==null||!Files.exists(root))return;try(var stream=Files.walk(root)){for(Path p:stream.sorted(java.util.Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}}
    private static String sha(byte[] bytes) { return OoxmlPackageSupport.sha256(bytes); }
    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t05 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t05", "SyntheticRasterOracle", "docx-mastery-t05", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t05".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }

    @FunctionalInterface private interface Throwing{void run()throws Exception;}
}
