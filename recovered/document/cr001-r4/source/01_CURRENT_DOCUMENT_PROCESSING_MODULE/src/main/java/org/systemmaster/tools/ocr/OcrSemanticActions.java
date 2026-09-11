package org.systemmaster.tools.ocr;

import java.util.*;

public final class OcrSemanticActions {
 public record Action(String action,String effect,String domain,String meaning){}
 private static final List<Action> ALL=List.of(
  new Action("ocr.source.inspect","READ","SOURCE","Inspect source/image/native text authority."),
  new Action("ocr.capture.admit","WRITE_METADATA","CAPTURE","Admit immutable capture artifact."),
  new Action("ocr.preprocess.plan","PLAN","PREPROCESS","Plan transformations."),
  new Action("ocr.preprocess.apply","DERIVE","PREPROCESS","Create preprocessing revision."),
  new Action("ocr.run.recognize","DERIVE","RECOGNITION","Run conventional OCR."),
  new Action("ocr.run.layout","DERIVE","LAYOUT","Run layout parser."),
  new Action("ocr.run.structured","DERIVE","STRUCTURE","Run structured OCR/VLM parser."),
  new Action("ocr.observe.text","READ","RECOGNITION","Query literal OCR observations."),
  new Action("ocr.observe.layout","READ","LAYOUT","Query region/geometry observations."),
  new Action("ocr.observe.table","READ","TABLE","Query table structure."),
  new Action("ocr.observe.formula","READ","FORMULA","Query formula observations."),
  new Action("ocr.observe.chart","READ","CHART","Query chart observations/claims."),
  new Action("ocr.observe.form","READ","FORM","Query form/key-value observations."),
  new Action("ocr.observe.seal","READ","STRUCTURE","Query seal/stamp observations."),
  new Action("ocr.observe.signature_region","READ","STRUCTURE","Query signature region only."),
  new Action("ocr.normalize.page","DERIVE","NORMALIZATION","Compile canonical page observation graph."),
  new Action("ocr.normalize.regions","DERIVE","NORMALIZATION","Resolve canonical region identities."),
  new Action("ocr.normalize.text","DERIVE","NORMALIZATION","Resolve line/word/glyph identities."),
  new Action("ocr.normalize.order","DERIVE","ORDER","Compile reading-order graph."),
  new Action("ocr.normalize.structure","DERIVE","STRUCTURE","Compile semantic structure graph."),
  new Action("ocr.compare.engines","VERIFY","DIFFERENTIAL","Produce disagreement evidence."),
  new Action("ocr.compare.variants","VERIFY","DIFFERENTIAL","Compare preprocessing variants."),
  new Action("ocr.calibrate.fit","QUALIFICATION","CONFIDENCE","Fit held-out calibration profile."),
  new Action("ocr.calibrate.apply","VERIFY","CONFIDENCE","Apply exact calibration profile."),
  new Action("ocr.validate.text","VERIFY","VALIDATION","Compare to ground truth/native source/validator."),
  new Action("ocr.validate.table","VERIFY","VALIDATION","Validate grid/cells/numerics."),
  new Action("ocr.validate.formula","VERIFY","VALIDATION","Validate formula representation."),
  new Action("ocr.validate.chart_values","VERIFY","VALIDATION","Validate exact numeric chart claims."),
  new Action("ocr.validate.business_rules","VERIFY","VALIDATION","Deterministic field/totals/schema checks."),
  new Action("ocr.decide.acceptance","DECIDE","CONFIDENCE","Auto-accept/review/refuse decision."),
  new Action("ocr.review.assign","WRITE_METADATA","REVIEW","Create review assignment."),
  new Action("ocr.review.accept","WRITE_METADATA","REVIEW","Record human acceptance."),
  new Action("ocr.review.correct","DERIVE","REVIEW","Create correction revision."),
  new Action("ocr.review.reject","WRITE_METADATA","REVIEW","Reject observation/claim."),
  new Action("ocr.security.classify","VERIFY","SECURITY","Prompt-injection/malformed/sensitivity classification."),
  new Action("ocr.route.select","PLAN","ROUTING","Choose qualified adapter route."),
  new Action("ocr.route.authorize_egress","AUTHORITY","SECURITY","Bind explicit network/provider authority."),
  new Action("ocr.route.verify_residency","VERIFY","SECURITY","Check exact provider/model/endpoint against policy."),
  new Action("ocr.route.verify_retention","VERIFY","SECURITY","Check retention/delete semantics."),
  new Action("ocr.publish.pagexml","DERIVE","PUBLICATION","Export exact PAGE profile derivative."),
  new Action("ocr.publish.alto","DERIVE","PUBLICATION","Export exact ALTO profile derivative."),
  new Action("ocr.publish.searchable_pdf","DERIVE","PUBLICATION","Cross-module searchable PDF derivative."),
  new Action("ocr.publish.text","DERIVE","PUBLICATION","Plain text derivative with source/evidence references."),
  new Action("ocr.publish.markdown","DERIVE","PUBLICATION","Structured markdown derivative."),
  new Action("ocr.mobile.observe_live","DERIVE","MOBILE","Transient device observation."),
  new Action("ocr.mobile.commit_capture","WRITE_ARTIFACT","MOBILE","Create immutable high-res source capture."),
  new Action("ocr.mobile.compare_server","VERIFY","MOBILE","Compare device vs server observations."),
  new Action("ocr.qualify.adapter","QUALIFICATION","QUALIFICATION","Run exact adapter-profile corpus qualification."),
  new Action("ocr.qualify.mobile","QUALIFICATION","QUALIFICATION","Run physical iPhone/device qualification."),
  new Action("ocr.qualify.cloud","QUALIFICATION","QUALIFICATION","Run live exact provider/model qualification."),
  new Action("ocr.qualify.security","QUALIFICATION","QUALIFICATION","Run prompt injection/malformed/resource tests."),
  new Action("ocr.benchmark.run","QUALIFICATION","BENCHMARK","Run pinned corpus/scorer."),
  new Action("ocr.release.accepted_view","COMMIT","RELEASE","Seal accepted OCR/correction view."),
  new Action("ocr.rollback","RECOVERY","RECOVERY","Restore/reconcile previous governed accepted view.")
);
 private OcrSemanticActions(){}
 public static List<Action> all(){return ALL;}
 public static Optional<Action> find(String id){return ALL.stream().filter(a->a.action().equals(id)).findFirst();}
}
