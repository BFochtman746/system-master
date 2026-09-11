package org.systemmaster.tools.docx;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Bounded OOXML package reader/mutator for the portable DOCX core. It never executes active content. */
public final class DocxPackageEngine {
    public static final String WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final int MAX_ENTRIES = 10_000;
    private static final long MAX_INFLATED_BYTES = 256L * 1024 * 1024;
    private static final int MAX_ENTRY_BYTES = 64 * 1024 * 1024;

    public record ActiveContentInventory(boolean macroProject, boolean embeddedObjects, boolean activeX, boolean externalRelationships) {}
    public record Inspection(List<String> paragraphs, List<String> entryNames, ActiveContentInventory activeContent, String semanticDigest) {}
    public record Mutation(byte[] bytes, int replacements, String sourceSemanticDigest, String resultSemanticDigest) {}

    public Inspection inspect(byte[] packageBytes) throws IOException {
        Map<String, byte[]> entries = readEntries(packageBytes);
        requireDocx(entries);
        Document document = parseXml(entries.get("word/document.xml"));
        List<String> paragraphs = paragraphs(document);
        ActiveContentInventory active = activeContent(entries);
        return new Inspection(paragraphs, entries.keySet().stream().sorted().toList(), active, semanticDigest(document));
    }

    public Mutation replaceText(byte[] packageBytes, String search, String replacement) throws IOException {
        String needle = requireText(search, "search", 16_384);
        String value = Objects.requireNonNull(replacement, "replacement");
        if (value.length() > 1_000_000) throw new IllegalArgumentException("replacement too large");
        Map<String, byte[]> entries = readEntries(packageBytes);
        requireDocx(entries);
        Document document = parseXml(entries.get("word/document.xml"));
        String sourceDigest = semanticDigest(document);
        NodeList textNodes = document.getElementsByTagNameNS(WORD_NS, "t");
        int count = 0;
        for (int i = 0; i < textNodes.getLength(); i++) {
            Node node = textNodes.item(i);
            String current = node.getTextContent();
            if (current != null && current.contains(needle)) {
                int occurrences = occurrences(current, needle);
                node.setTextContent(current.replace(needle, value));
                if (needsPreserveSpace(node.getTextContent()) && node instanceof Element element) {
                    element.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve");
                }
                count = Math.addExact(count, occurrences);
            }
        }
        if (count == 0) throw new IllegalArgumentException("replacement target not found in a single Word text node");
        entries.put("word/document.xml", serializeXml(document));
        byte[] mutated = writeEntries(entries);
        String resultDigest = semanticDigest(parseXml(entries.get("word/document.xml")));
        return new Mutation(mutated, count, sourceDigest, resultDigest);
    }

    private static int occurrences(String value, String needle) {
        int count = 0;
        for (int at = 0; (at = value.indexOf(needle, at)) >= 0; at += needle.length()) count++;
        return count;
    }

    private static boolean needsPreserveSpace(String value) {
        return value != null && (!value.isEmpty()) && (Character.isWhitespace(value.charAt(0)) || Character.isWhitespace(value.charAt(value.length() - 1)));
    }

    private static List<String> paragraphs(Document document) {
        NodeList ps = document.getElementsByTagNameNS(WORD_NS, "p");
        List<String> out = new ArrayList<>(Math.min(ps.getLength(), 100_000));
        for (int i = 0; i < ps.getLength(); i++) {
            NodeList ts = ((Element) ps.item(i)).getElementsByTagNameNS(WORD_NS, "t");
            StringBuilder paragraph = new StringBuilder();
            for (int j = 0; j < ts.getLength(); j++) paragraph.append(ts.item(j).getTextContent());
            out.add(paragraph.toString());
        }
        return List.copyOf(out);
    }

    private static ActiveContentInventory activeContent(Map<String, byte[]> entries) {
        boolean macro = entries.keySet().stream().anyMatch(n -> n.equalsIgnoreCase("word/vbaProject.bin"));
        boolean embedded = hasUnsafeEmbeddedObjects(entries);
        boolean activeX = entries.keySet().stream().anyMatch(n -> n.toLowerCase(Locale.ROOT).startsWith("word/activex/"));
        boolean external = entries.entrySet().stream()
                .filter(e -> e.getKey().toLowerCase(Locale.ROOT).endsWith(".rels"))
                .map(e -> new String(e.getValue(), StandardCharsets.UTF_8))
                .anyMatch(v -> v.contains("TargetMode=\"External\"") || v.contains("TargetMode='External'"));
        return new ActiveContentInventory(macro, embedded, activeX, external);
    }


    private static boolean hasUnsafeEmbeddedObjects(Map<String, byte[]> entries) {
        List<String> embeddedParts = entries.keySet().stream()
                .filter(n -> n.toLowerCase(Locale.ROOT).startsWith("word/embeddings/"))
                .toList();
        for (String part : embeddedParts) {
            if (!isSafeChartWorkbook(entries, part)) return true;
        }
        return false;
    }

    private static boolean isSafeChartWorkbook(Map<String, byte[]> entries, String embeddedPart) {
        String lower = embeddedPart.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".xlsx")) return false;
        String basename = embeddedPart.substring(embeddedPart.lastIndexOf('/') + 1);
        boolean chartOwned = entries.entrySet().stream()
                .filter(e -> e.getKey().toLowerCase(Locale.ROOT).startsWith("word/charts/_rels/"))
                .filter(e -> e.getKey().toLowerCase(Locale.ROOT).endsWith(".rels"))
                .map(e -> new String(e.getValue(), StandardCharsets.UTF_8))
                .anyMatch(xml -> xml.contains("../embeddings/" + basename)
                        && xml.contains("/relationships/package"));
        if (!chartOwned) return false;
        try {
            Map<String, byte[]> workbook = readEntries(entries.get(embeddedPart));
            for (Map.Entry<String, byte[]> entry : workbook.entrySet()) {
                String n = entry.getKey().toLowerCase(Locale.ROOT);
                if (n.contains("vbaproject.bin")
                        || n.startsWith("xl/activex/")
                        || n.startsWith("xl/embeddings/")
                        || n.startsWith("xl/externallinks/")) return false;
                if (n.startsWith("xl/worksheets/") && n.endsWith(".xml")) {
                    try {
                        Document worksheet = parseXml(entry.getValue());
                        if (worksheet.getElementsByTagNameNS("*", "f").getLength() > 0) return false;
                    } catch (IOException ex) {
                        return false;
                    }
                }
            }
            return workbook.entrySet().stream()
                    .filter(e -> e.getKey().toLowerCase(Locale.ROOT).endsWith(".rels"))
                    .map(e -> new String(e.getValue(), StandardCharsets.UTF_8))
                    .noneMatch(xml -> xml.contains("TargetMode=\"External\"") || xml.contains("TargetMode='External'"));
        } catch (IOException ex) {
            return false;
        }
    }

    private static Map<String, byte[]> readEntries(byte[] packageBytes) throws IOException {
        Objects.requireNonNull(packageBytes, "packageBytes");
        LinkedHashMap<String, byte[]> entries = new LinkedHashMap<>();
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(packageBytes))) {
            ZipEntry entry;
            int count = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > MAX_ENTRIES) throw new IOException("DOCX entry count limit exceeded");
                String name = safeEntryName(entry.getName());
                if (entry.isDirectory()) continue;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[32 * 1024];
                int n;
                int entryBytes = 0;
                while ((n = zip.read(buffer)) != -1) {
                    entryBytes = Math.addExact(entryBytes, n);
                    total = Math.addExact(total, n);
                    if (entryBytes > MAX_ENTRY_BYTES || total > MAX_INFLATED_BYTES) throw new IOException("DOCX inflated content limit exceeded");
                    out.write(buffer, 0, n);
                }
                if (entries.putIfAbsent(name, out.toByteArray()) != null) throw new IOException("duplicate DOCX entry: " + name);
            }
        }
        return entries;
    }

    private static byte[] writeEntries(Map<String, byte[]> entries) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            List<String> names = entries.keySet().stream().sorted(Comparator.naturalOrder()).toList();
            for (String name : names) {
                ZipEntry entry = new ZipEntry(safeEntryName(name));
                entry.setTime(0L);
                zip.putNextEntry(entry);
                zip.write(entries.get(name));
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static void requireDocx(Map<String, byte[]> entries) throws IOException {
        if (!entries.containsKey("[Content_Types].xml") || !entries.containsKey("word/document.xml")) {
            throw new IOException("not a WordprocessingML package");
        }
    }

    private static String safeEntryName(String raw) throws IOException {
        if (raw == null || raw.isBlank() || raw.startsWith("/") || raw.startsWith("\\") || raw.contains("\\")) throw new IOException("unsafe DOCX entry path");
        String[] parts = raw.split("/");
        for (String part : parts) if (part.equals("..") || part.equals(".")) throw new IOException("unsafe DOCX entry traversal");
        return raw;
    }

    private static Document parseXml(byte[] bytes) throws IOException {
        if (bytes == null) throw new IOException("missing XML part");
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            return factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
        } catch (ParserConfigurationException | SAXException e) {
            throw new IOException("invalid or unsafe DOCX XML", e);
        }
    }

    private static byte[] serializeXml(Document document) throws IOException {
        try {
            TransformerFactory factory = TransformerFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
            Transformer transformer = factory.newTransformer();
            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            transformer.transform(new DOMSource(document), new StreamResult(out));
            return out.toByteArray();
        } catch (TransformerException | IllegalArgumentException e) {
            throw new IOException("unable to serialize DOCX XML", e);
        }
    }

    private static String semanticDigest(Document document) {
        StringBuilder canonical = new StringBuilder();
        for (String paragraph : paragraphs(document)) canonical.append(paragraph).append('\n');
        return sha256(canonical.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String requireText(String value, String name, int max) {
        if (value == null || value.isEmpty() || value.length() > max) throw new IllegalArgumentException(name);
        return value;
    }
}
