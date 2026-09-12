package org.systemmaster.tools.ocr;
import java.time.Instant;import java.util.*;
/** Canonical OCR transaction/routing authority with immutable source binding and engine-identity evidence. */
final class OcrFullLaneService {
 public record Receipt(String action,String sourceSha256,String engineId,String engineVersion,String engineDigest,boolean networkRequired,int regionCount,List<String> diagnostics,Instant observedAt){}
 private final OcrFullLaneEngine engine=new OcrFullLaneEngine();
 public OcrFullLaneEngine.PageGraph recognize(OcrEnginePort port,byte[] source,String action,Map<String,String> options)throws Exception{OcrSemanticActions.find(action).orElseThrow(()->new IllegalArgumentException("unknown OCR semantic action"));var id=port.identity();if(!id.healthy()||!id.capabilities().contains(action))throw new IllegalStateException("OCR engine not qualified/healthy for "+action);return engine.normalize(source,id,port.recognize(source,action,options));}
 public Receipt receipt(OcrEnginePort port,byte[] source,String action,OcrFullLaneEngine.PageGraph graph){var id=port.identity();return new Receipt(action,graph.sourceSha256(),id.engineId(),id.version(),id.digest(),id.networkRequired(),graph.regions().size(),graph.diagnostics(),Instant.now());}
 public OcrFullLaneEngine engine(){return engine;}
}
