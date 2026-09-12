package org.systemmaster.tools.pdf;
import java.util.*;
/** Replaceable qualified parser/renderer/editor/validator adapter; PDF canonical authority remains above it. */
public interface PdfEnginePort {
 record Identity(String engineId,String version,String digest,Set<String> capabilities,boolean healthy) { public Identity{capabilities=Set.copyOf(capabilities);} }
 record Request(String action,byte[] source,Map<String,String> parameters) { public Request{source=source==null?null:source.clone();parameters=Map.copyOf(parameters);} }
 record Result(byte[] output,Map<String,String> facts,List<String> diagnostics) { public Result{output=output==null?null:output.clone();facts=Map.copyOf(facts);diagnostics=List.copyOf(diagnostics);} }
 Identity identity(); Result execute(Request request) throws Exception;
}
