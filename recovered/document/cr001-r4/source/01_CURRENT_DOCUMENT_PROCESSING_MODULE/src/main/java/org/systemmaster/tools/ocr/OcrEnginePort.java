package org.systemmaster.tools.ocr;
import java.util.*;
/** Replaceable OCR/layout/VLM adapter. Provider confidence is observation, never canonical truth. */
public interface OcrEnginePort {
 record Identity(String engineId,String version,String digest,Set<String> capabilities,boolean healthy,boolean networkRequired){public Identity{capabilities=Set.copyOf(capabilities);}}
 record Region(String id,String text,double x,double y,double width,double height,double confidence,String type,Map<String,String> facts){public Region{facts=Map.copyOf(facts);}}
 record Result(List<Region> regions,Map<String,String> facts,List<String> diagnostics){public Result{regions=List.copyOf(regions);facts=Map.copyOf(facts);diagnostics=List.copyOf(diagnostics);}}
 Identity identity(); Result recognize(byte[] image,String action,Map<String,String> options)throws Exception;
}
