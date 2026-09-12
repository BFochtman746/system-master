package org.systemmaster.tools.document;

import java.util.*;

/** Human-document and presentation artifact formats owned or recognized by the Universal Document module. */
public enum DocumentFormat {
    DOCX("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Set.of("docx"), true, false),
    DOCM("application/vnd.ms-word.document.macroenabled.12", Set.of("docm"), true, false),
    PDF("application/pdf", Set.of("pdf"), true, false),
    PPTX("application/vnd.openxmlformats-officedocument.presentationml.presentation", Set.of("pptx"), true, false),
    PPTM("application/vnd.ms-powerpoint.presentation.macroenabled.12", Set.of("pptm"), true, false),
    MARKDOWN("text/markdown", Set.of("md", "markdown", "mdown", "mkd"), true, true),
    PLAIN_TEXT("text/plain", Set.of("txt", "text"), true, true),
    HTML("text/html", Set.of("html", "htm"), true, true),
    RTF("text/rtf", Set.of("rtf"), true, true),
    ODT("application/vnd.oasis.opendocument.text", Set.of("odt"), false, false),
    EPUB("application/epub+zip", Set.of("epub"), false, false),
    LEGACY_DOC("application/msword", Set.of("doc"), false, false),
    LEGACY_PPT("application/vnd.ms-powerpoint", Set.of("ppt"), false, false),
    ODP("application/vnd.oasis.opendocument.presentation", Set.of("odp"), false, false),
    PPSX("application/vnd.openxmlformats-officedocument.presentationml.slideshow", Set.of("ppsx"), false, false),
    POTX("application/vnd.openxmlformats-officedocument.presentationml.template", Set.of("potx"), false, false),
    UNKNOWN("application/octet-stream", Set.of(), false, false);

    private final String mediaType;
    private final Set<String> extensions;
    private final boolean portableFoundation;
    private final boolean textFamily;

    DocumentFormat(String mediaType, Set<String> extensions, boolean portableFoundation, boolean textFamily) {
        this.mediaType = mediaType;
        this.extensions = Set.copyOf(extensions);
        this.portableFoundation = portableFoundation;
        this.textFamily = textFamily;
    }

    public String mediaType() { return mediaType; }
    public Set<String> extensions() { return extensions; }
    public boolean portableFoundation() { return portableFoundation; }
    public boolean textFamily() { return textFamily; }
    public boolean presentationFamily() { return this == PPTX || this == PPTM || this == LEGACY_PPT || this == ODP || this == PPSX || this == POTX; }

    public static Optional<DocumentFormat> fromMediaType(String value) {
        if (value == null) return Optional.empty();
        String normalized = value.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        if (normalized.equals("application/rtf")) normalized = "text/rtf";
        if (normalized.equals("text/x-markdown")) normalized = "text/markdown";
        final String n = normalized;
        return Arrays.stream(values()).filter(f -> f.mediaType.equals(n)).findFirst();
    }

    public static Optional<DocumentFormat> fromFileName(String fileName) {
        if (fileName == null) return Optional.empty();
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) return Optional.empty();
        String ext = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
        return Arrays.stream(values()).filter(f -> f.extensions.contains(ext)).findFirst();
    }
}
