package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactMediaDetector;
import java.nio.charset.*;
import java.util.*;

/** Combines byte truth with a filename/declaration hint for text formats that have no unique magic bytes. */
public final class DocumentFormatDetector {
    private final ArtifactMediaDetector detector = new ArtifactMediaDetector();

    public DocumentFormat detect(byte[] bytes, String fileNameHint, String declaredMediaType) {
        Objects.requireNonNull(bytes, "bytes");
        String detected = detector.detect(bytes);
        Optional<DocumentFormat> strong = DocumentFormat.fromMediaType(detected);
        if (strong.isPresent() && strong.get() != DocumentFormat.PLAIN_TEXT && strong.get() != DocumentFormat.UNKNOWN) return strong.get();

        Optional<DocumentFormat> declared = DocumentFormat.fromMediaType(declaredMediaType);
        Optional<DocumentFormat> named = DocumentFormat.fromFileName(fileNameHint);
        if ("text/plain".equals(detected)) {
            if (declared.isPresent() && declared.get().textFamily()) return declared.get();
            if (named.isPresent() && named.get().textFamily()) return named.get();
            return DocumentFormat.PLAIN_TEXT;
        }
        if (named.isPresent() && !named.get().portableFoundation()) return named.get();
        return strong.orElse(DocumentFormat.UNKNOWN);
    }

    public static boolean validUtf8Text(byte[] bytes) {
        try {
            CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            decoder.decode(java.nio.ByteBuffer.wrap(bytes));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }
}
