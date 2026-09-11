package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFinalizationGate;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentProofReceipt;
import org.systemmaster.tools.document.NativePartPreservationMap;

import java.util.List;
import java.util.Objects;

/** Result of one governed spine job; bytes are copied at boundaries. */
public record DocumentSpineResult(
        DocumentSpineJob job,
        DocumentFormat sourceFormat,
        byte[] sourceBytes,
        CanonicalDocumentGraphV2 sourceGraph,
        String extractedText,
        byte[] resultBytes,
        CanonicalDocumentGraphV2 resultGraph,
        NativePartPreservationMap.Assessment preservation,
        List<DocumentProofReceipt> proofReceipts,
        DocumentFinalizationGate.Result finalization,
        DocumentSpineVersionReceipt version,
        DocumentSpinePublicationReceipt publication,
        List<DocumentSpineStageReceipt> stageReceipts) {

    public DocumentSpineResult {
        Objects.requireNonNull(job, "job");
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        sourceBytes = Objects.requireNonNull(sourceBytes, "sourceBytes").clone();
        Objects.requireNonNull(sourceGraph, "sourceGraph");
        extractedText = Objects.requireNonNullElse(extractedText, "");
        resultBytes = resultBytes == null ? null : resultBytes.clone();
        proofReceipts = List.copyOf(Objects.requireNonNullElse(proofReceipts, List.of()));
        stageReceipts = List.copyOf(Objects.requireNonNullElse(stageReceipts, List.of()));
    }

    @Override
    public byte[] sourceBytes() {
        return sourceBytes.clone();
    }

    @Override
    public byte[] resultBytes() {
        return resultBytes == null ? null : resultBytes.clone();
    }
}
