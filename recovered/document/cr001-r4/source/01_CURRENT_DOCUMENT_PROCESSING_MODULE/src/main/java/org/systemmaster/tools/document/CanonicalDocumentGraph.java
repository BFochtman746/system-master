package org.systemmaster.tools.document;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Format-neutral semantic projection for governed human documents and presentations.
 * Native bytes remain authoritative for format-specific features that this graph cannot represent.
 */
public record CanonicalDocumentGraph(
        String schemaVersion,
        DocumentFormat sourceFormat,
        String sourceSha256,
        Kind kind,
        List<Node> nodes,
        List<NativePart> nativeParts) {

    public static final String SCHEMA_V1 = "CDG-1";

    public enum Kind { FLOW_DOCUMENT, PRESENTATION, FIXED_LAYOUT, TEXT_DOCUMENT }
    public enum NodeType {
        ROOT, METADATA, SECTION, PARAGRAPH, RUN, LIST, LIST_ITEM,
        TABLE, TABLE_ROW, TABLE_CELL, FIGURE, IMAGE, CHART, EQUATION,
        HYPERLINK, CITATION, FOOTNOTE, ENDNOTE, COMMENT, REVISION,
        SLIDE, SLIDE_TEXT, SLIDE_LAYOUT, SLIDE_MASTER, SPEAKER_NOTE,
        MEDIA, TEXT_BLOCK, PAGE
    }

    public record SourceAnchor(String nativePart, String locator) {
        public SourceAnchor {
            nativePart = Objects.requireNonNullElse(nativePart, "<artifact>");
            locator = Objects.requireNonNullElse(locator, "");
        }
    }

    public record Node(
            String id,
            NodeType type,
            String parentId,
            int ordinal,
            String text,
            Map<String,String> attributes,
            SourceAnchor sourceAnchor) {
        public Node {
            if (id == null || id.isBlank()) throw new IllegalArgumentException("node id required");
            Objects.requireNonNull(type, "type");
            if (ordinal < 0) throw new IllegalArgumentException("negative node ordinal");
            text = Objects.requireNonNullElse(text, "");
            attributes = Map.copyOf(Objects.requireNonNullElse(attributes, Map.of()));
            sourceAnchor = Objects.requireNonNullElseGet(sourceAnchor, () -> new SourceAnchor("<artifact>", ""));
        }
    }

    public record NativePart(String partName, String sha256, boolean preserveByDefault) {
        public NativePart {
            if (partName == null || partName.isBlank()) throw new IllegalArgumentException("native part name required");
            requireSha256(sha256, "native part");
        }
    }

    public CanonicalDocumentGraph {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported CDG schema: " + schemaVersion);
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        requireSha256(sourceSha256, "source");
        Objects.requireNonNull(kind, "kind");
        nodes = List.copyOf(Objects.requireNonNull(nodes, "nodes"));
        nativeParts = List.copyOf(Objects.requireNonNull(nativeParts, "nativeParts"));
        validateNodes(nodes);
        validateParts(nativeParts);
    }

    public String semanticDigest() {
        StringBuilder canonical = new StringBuilder();
        canonical.append(schemaVersion).append('|').append(sourceFormat).append('|').append(kind).append('\n');
        for (Node node : nodes) {
            canonical.append(node.id()).append('|').append(node.type()).append('|')
                    .append(Objects.requireNonNullElse(node.parentId(), "")).append('|').append(node.ordinal()).append('|')
                    .append(escape(node.text())).append('|').append(escape(node.sourceAnchor().nativePart())).append('|')
                    .append(escape(node.sourceAnchor().locator()));
            node.attributes().entrySet().stream().sorted(Map.Entry.comparingByKey())
                    .forEach(e -> canonical.append('|').append(escape(e.getKey())).append('=').append(escape(e.getValue())));
            canonical.append('\n');
        }
        return sha256(canonical.toString().getBytes(StandardCharsets.UTF_8));
    }


    public Node requireNode(String id) {
        Node node = nodesById().get(id);
        if (node == null) throw new IllegalArgumentException("CDG node not found: " + id);
        return node;
    }

    public List<Node> childrenOf(String parentId) {
        ArrayList<Node> out = new ArrayList<>();
        for (Node node : nodes) if (Objects.equals(parentId, node.parentId())) out.add(node);
        out.sort(java.util.Comparator.comparingInt(Node::ordinal).thenComparing(Node::id));
        return List.copyOf(out);
    }
    public Map<String,Node> nodesById() {
        LinkedHashMap<String,Node> out = new LinkedHashMap<>();
        for (Node node : nodes) out.put(node.id(), node);
        return Map.copyOf(out);
    }

    private static void validateNodes(List<Node> nodes) {
        if (nodes.isEmpty()) throw new IllegalArgumentException("CDG requires nodes");
        Set<String> ids = new HashSet<>();
        int roots = 0;
        for (Node node : nodes) {
            if (!ids.add(node.id())) throw new IllegalArgumentException("duplicate CDG node id: " + node.id());
            if (node.type() == NodeType.ROOT) {
                roots++;
                if (node.parentId() != null) throw new IllegalArgumentException("root cannot have parent");
            } else if (node.parentId() == null || node.parentId().isBlank()) {
                throw new IllegalArgumentException("non-root node requires parent: " + node.id());
            }
        }
        if (roots != 1) throw new IllegalArgumentException("CDG requires exactly one root");
        for (Node node : nodes) {
            if (node.parentId() != null && !ids.contains(node.parentId())) {
                throw new IllegalArgumentException("CDG parent missing for " + node.id());
            }
        }
    }

    private static void validateParts(List<NativePart> parts) {
        Set<String> names = new HashSet<>();
        for (NativePart part : parts) if (!names.add(part.partName())) throw new IllegalArgumentException("duplicate native part: " + part.partName());
    }

    private static String escape(String value) {
        return Objects.requireNonNullElse(value, "").replace("\\", "\\\\").replace("|", "\\|").replace("\n", "\\n");
    }

    static String stableNodeId(String sourceSha256, String type, String locator) {
        String digest = sha256((sourceSha256 + "|" + type + "|" + locator).getBytes(StandardCharsets.UTF_8));
        return "n-" + digest.substring(0, 20);
    }

    static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static void requireSha256(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
