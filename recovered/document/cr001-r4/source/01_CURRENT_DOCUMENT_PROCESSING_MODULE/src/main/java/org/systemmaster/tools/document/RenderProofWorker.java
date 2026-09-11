package org.systemmaster.tools.document;

import java.util.List;
import java.util.Objects;

/** Replaceable isolated render/proof worker boundary. */
public interface RenderProofWorker {
    record Request(
            DocumentFormat format,
            byte[] artifact,
            String fileName,
            Integer expectedPageCount,
            int minimumPageCount,
            List<String> requiredTextSnippets,
            int minimumImageCount,
            boolean requireEveryPageNonBlank) {
        public Request {
            Objects.requireNonNull(format, "format");
            artifact = Objects.requireNonNull(artifact, "artifact").clone();
            if (artifact.length == 0) throw new IllegalArgumentException("artifact bytes required");
            fileName = Objects.requireNonNullElse(fileName, "artifact");
            if (expectedPageCount != null && expectedPageCount < 1) throw new IllegalArgumentException("expectedPageCount must be >= 1");
            if (minimumPageCount < 1) throw new IllegalArgumentException("minimumPageCount must be >= 1");
            requiredTextSnippets = List.copyOf(Objects.requireNonNullElse(requiredTextSnippets, List.of()));
            if (minimumImageCount < 0) throw new IllegalArgumentException("minimumImageCount cannot be negative");
        }
        @Override public byte[] artifact() { return artifact.clone(); }
    }

    record Result(byte[] renderedPdf, RenderProofReceipt receipt, List<String> logs) {
        public Result {
            renderedPdf = Objects.requireNonNull(renderedPdf, "renderedPdf").clone();
            Objects.requireNonNull(receipt, "receipt");
            logs = List.copyOf(Objects.requireNonNullElse(logs, List.of()));
        }
        @Override public byte[] renderedPdf() { return renderedPdf.clone(); }
    }

    Result prove(Request request) throws Exception;
}
