package org.systemmaster.tools.pptx;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Frozen full-lane PowerPoint/PPTX capability disposition ledger for MOD-PPTX-001. */
public final class PptxFullLaneCapabilities {
    public record Disposition(String capabilityId, String capability, String disposition) {}
    private static final List<Disposition> ALL = build();
    private PptxFullLaneCapabilities() {}

    public static List<Disposition> all() { return ALL; }
    public static Map<String,Disposition> byId() { LinkedHashMap<String,Disposition> m=new LinkedHashMap<>(); for (Disposition d:ALL) m.put(d.capabilityId(),d); return Map.copyOf(m); }
    public static long portableImplemented(){ return ALL.stream().filter(d->d.disposition().equals("PORTABLE_IMPLEMENTED")).count(); }
    public static long delegated(){ return ALL.stream().filter(d->d.disposition().startsWith("DELEGATED_")).count(); }
    public static long externalPending(){ return ALL.stream().filter(d->d.disposition().contains("PENDING")).count(); }

    private static List<Disposition> build() {
        ArrayList<Disposition> out = new ArrayList<>();
        p(out,"cap.pptx.presentation.create","create a new presentation from intent/outline");
        p(out,"cap.pptx.presentation.inspect","inspect package, slides, sections, relationships and security posture");
        p(out,"cap.pptx.slide.create","create a new slide with title/body content");
        p(out,"cap.pptx.slide.delete","delete a slide and update presentation ordering");
        p(out,"cap.pptx.slide.reorder","reorder slides while preserving relationships");
        p(out,"cap.pptx.slide.duplicate","duplicate a slide and its local relationships");
        p(out,"cap.pptx.text.extract","extract all text from slides and notes");
        p(out,"cap.pptx.text.replace","replace bounded text occurrences with immutable child version");
        p(out,"cap.pptx.text.append","append text runs to a slide placeholder/body");
        p(out,"cap.pptx.notes.inspect","inspect speaker notes");
        p(out,"cap.pptx.notes.edit","create or edit speaker notes");
        p(out,"cap.pptx.hyperlinks.inspect","inspect internal and external hyperlinks");
        p(out,"cap.pptx.hyperlinks.edit","add, replace or remove hyperlink relationships safely");
        p(out,"cap.pptx.media.inventory","inventory image/audio/video/media parts");
        p(out,"cap.pptx.media.add","add governed media part and relationship");
        p(out,"cap.pptx.media.replace","replace governed media part under digest precondition");
        p(out,"cap.pptx.table.inventory","inventory DrawingML table objects");
        p(out,"cap.pptx.table.edit","create or edit basic table XML");
        p(out,"cap.pptx.chart.inventory","inventory chart parts and references");
        p(out,"cap.pptx.chart.create","create or mutate chart package parts via specialist route");
        p(out,"cap.pptx.shape.inventory","inventory shapes, placeholders and text boxes");
        p(out,"cap.pptx.shape.property.edit","edit bounded shape XML properties via specialist route");
        p(out,"cap.pptx.theme.inventory","inventory theme/master/layout relationships");
        p(out,"cap.pptx.theme.apply","apply theme/layout package parts with preconditions");
        p(out,"cap.pptx.master.inventory","inspect slide masters and layouts");
        p(out,"cap.pptx.master.edit","mutate master/layout package parts under specialist route");
        p(out,"cap.pptx.sections.inventory","inventory section metadata where present");
        p(out,"cap.pptx.sections.edit","edit section metadata via safe XML route");
        p(out,"cap.pptx.comments.inventory","inventory comments/authors");
        p(out,"cap.pptx.comments.edit","add or replace comment package parts safely");
        p(out,"cap.pptx.metadata.inspect","inspect core/app/custom document properties");
        p(out,"cap.pptx.metadata.edit","edit core/app/custom document properties");
        p(out,"cap.pptx.security.inventory","inventory macros, OLE, ActiveX, external links and embedded packages");
        p(out,"cap.pptx.macro.inventory","passively inventory VBA project and macro indicators");
        p(out,"cap.pptx.ole.inventory","passively inventory OLE objects");
        p(out,"cap.pptx.external.inventory","inventory external relationship targets");
        p(out,"cap.pptx.package.repair","repair stale/missing safe package parts where deterministic");
        p(out,"cap.pptx.package.diff","compare package/semantic presentation state");
        p(out,"cap.pptx.package.roundtrip.verify","reopen and verify deterministic package roundtrip");
        p(out,"cap.pptx.package.mutation.plan","apply digest-bound OOXML mutation plan");
        p(out,"cap.pptx.accessibility.diagnose","diagnose missing titles/alt text/reading-order risks");
        p(out,"cap.pptx.template.apply","apply portable template package parts");
        p(out,"cap.pptx.outline.plan","plan a presentation from a structured outline");
        p(out,"cap.pptx.export.model","build an export model for downstream rendering/provider routes");
        p(out,"cap.pptx.compatibility.diagnose","diagnose compatibility and unsupported content");
        p(out,"cap.pptx.troubleshoot","troubleshoot corrupted or malformed presentations");
        p(out,"cap.pptx.rollback.version","rollback by PLATFORM-008 lineage");
        p(out,"cap.pptx.receipt.emit","emit deterministic operation receipt");
        p(out,"cap.pptx.adversarial.scan","scan for dangerous active content and unsafe relationships");
        p(out,"cap.pptx.provenance.bind","bind source/result/proof provenance");
        p(out,"cap.pptx.animation.inventory","inventory animation/timing XML");
        p(out,"cap.pptx.animation.edit","mutate animation/timing XML via specialist route");
        p(out,"cap.pptx.smartart.inventory","inventory SmartArt diagram parts");
        p(out,"cap.pptx.smartart.edit","mutate SmartArt diagram parts via specialist route");
        p(out,"cap.pptx.equation.inventory","inventory equations/math markup");
        p(out,"cap.pptx.equation.edit","mutate equation XML via specialist route");
        p(out,"cap.pptx.handout.print.inspect","inspect handout/print/page setup metadata");
        p(out,"cap.pptx.handout.print.edit","edit handout/print/page setup metadata");
        p(out,"cap.pptx.slide.size.edit","edit slide size/page setup");
        p(out,"cap.pptx.customxml.preserve","preserve unknown/custom XML parts across operations");
        p(out,"cap.pptx.unknown.parts.preserve","preserve unsupported package parts exactly");
        p(out,"cap.pptx.content.types.repair","repair content type defaults/overrides for known safe parts");
        p(out,"cap.pptx.relationships.repair","repair safe relationship entries with preconditions");
        p(out,"cap.pptx.large.deck.profile","profile large deck/package structure without extracting active content");
        d(out,"cap.pptx.ai.draft","draft presentation content through PLATFORM-009 model authority");
        d(out,"cap.pptx.research.ground","ground slide content through PLATFORM-011 retrieval authority");
        d(out,"cap.pptx.sandbox.code.generate","generate/test helper code through PLATFORM-010 sandbox authority");
        d(out,"cap.pptx.artifact.publish","publish/revision/rollback through PLATFORM-008 artifact authority");
        d(out,"cap.pptx.workflow.orchestrate","orchestrate long presentation jobs through KEEL/Chat authorities");
        d(out,"cap.pptx.diagram.image.generate","delegate image/diagram creation to media/image authorities");
        x(out,"cap.pptx.native.render.oracle","requires native PowerPoint or equivalent rendering oracle");
        x(out,"cap.pptx.native.animation.playback","requires native PowerPoint animation/timing playback oracle");
        x(out,"cap.pptx.native.export.pdf.video","requires native/export provider for exact PDF/video fidelity");
        x(out,"cap.pptx.live.coauthoring","requires live Office/PowerPoint coauthoring host");
        x(out,"cap.pptx.officejs.execute","requires Office.js host execution");
        x(out,"cap.pptx.vba.execute","requires macro execution host and security approval");
        x(out,"cap.pptx.protected.irm.open","requires protected/IRM host credentials and policy");
        x(out,"cap.pptx.embedded.ole.execute","requires native OLE host execution environment");
        if (out.size()!=78) throw new IllegalStateException("PPTX capability count "+out.size());
        return List.copyOf(out);
    }
    private static void p(List<Disposition> out,String id,String name){out.add(new Disposition(id,name,"PORTABLE_IMPLEMENTED"));}
    private static void d(List<Disposition> out,String id,String name){out.add(new Disposition(id,name,"DELEGATED_EXISTING_AUTHORITY"));}
    private static void x(List<Disposition> out,String id,String name){out.add(new Disposition(id,name,"EXTERNAL_NATIVE_PENDING"));}
}
