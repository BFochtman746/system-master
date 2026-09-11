package org.systemmaster.tools.pptx;

import org.systemmaster.tools.common.OoxmlMutationPlan;

import java.io.IOException;
import java.util.List;

/** Headless service facade for MOD-PPTX-001 full-lane operations. */
final class PptxFullLaneService {
    private final PptxFullLaneEngine engine;
    public PptxFullLaneService(){this(new PptxFullLaneEngine());}
    public PptxFullLaneService(PptxFullLaneEngine engine){this.engine=engine;}
    public byte[] create(String title,List<PptxFullLaneEngine.SlideSpec> slides) throws IOException{return engine.createPresentation(title,slides);} 
    public PptxPackageEngine.Inspection inspect(byte[] pptx) throws IOException{return engine.inspect(pptx);} 
    public byte[] replaceText(byte[] pptx,String from,String to) throws IOException{return engine.replaceText(pptx,from,to);} 
    public byte[] mutate(byte[] pptx,OoxmlMutationPlan plan) throws IOException{return engine.applyAdvancedPlan(pptx,plan);} 
    public PptxFullLaneEngine.Verification verify(byte[] pptx){return engine.verify(pptx);} 
}
