package org.systemmaster.tools.common;

import org.w3c.dom.Document;
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
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Shared bounded OPC/OOXML package primitive used by document and spreadsheet tools. */
public final class OoxmlPackageSupport {
    private static final int MAX_ENTRIES = 20_000;
    private static final int MAX_ENTRY_BYTES = 128 * 1024 * 1024;
    private static final long MAX_TOTAL_BYTES = 512L * 1024 * 1024;
    private OoxmlPackageSupport() {}

    public static Map<String, byte[]> read(byte[] bytes) throws IOException {
        Objects.requireNonNull(bytes, "bytes");
        Map<String, byte[]> out = new LinkedHashMap<>();
        long total = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry e; int count=0;
            while ((e=zip.getNextEntry())!=null) {
                if (++count>MAX_ENTRIES) throw new IOException("OOXML entry count exceeded");
                if (e.isDirectory()) continue;
                String name=safeName(e.getName());
                ByteArrayOutputStream part=new ByteArrayOutputStream();
                byte[] buf=new byte[32768]; int n, size=0;
                while ((n=zip.read(buf))!=-1) {
                    size=Math.addExact(size,n); total=Math.addExact(total,n);
                    if (size>MAX_ENTRY_BYTES || total>MAX_TOTAL_BYTES) throw new IOException("OOXML inflated size exceeded");
                    part.write(buf,0,n);
                }
                if (out.putIfAbsent(name,part.toByteArray())!=null) throw new IOException("duplicate OOXML part: "+name);
            }
        }
        return out;
    }

    public static byte[] write(Map<String, byte[]> entries) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        try (ZipOutputStream zip=new ZipOutputStream(out)) {
            for (String name: entries.keySet().stream().sorted(Comparator.naturalOrder()).toList()) {
                ZipEntry e=new ZipEntry(safeName(name)); e.setTime(0L); zip.putNextEntry(e); zip.write(entries.get(name)); zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    public static Document parseXml(byte[] bytes) throws IOException {
        try {
            DocumentBuilderFactory f=DocumentBuilderFactory.newInstance(); f.setNamespaceAware(true);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
            f.setFeature("http://xml.org/sax/features/external-general-entities",false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
            f.setXIncludeAware(false); f.setExpandEntityReferences(false);
            return f.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
        } catch (ParserConfigurationException|SAXException e) { throw new IOException("invalid or unsafe OOXML XML",e); }
    }

    public static byte[] serialize(Document doc) throws IOException {
        try {
            TransformerFactory f=TransformerFactory.newInstance(); f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,""); f.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET,"");
            Transformer t=f.newTransformer(); t.setOutputProperty(OutputKeys.ENCODING,"UTF-8"); t.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION,"no");
            ByteArrayOutputStream out=new ByteArrayOutputStream(); t.transform(new DOMSource(doc),new StreamResult(out)); return out.toByteArray();
        } catch (TransformerException|IllegalArgumentException e) { throw new IOException("OOXML serialization failed",e); }
    }

    public static byte[] replacePart(byte[] packageBytes, String partName, byte[] replacement, String expectedSha256) throws IOException {
        String safe=safeName(partName); Map<String,byte[]> entries=read(packageBytes); byte[] current=entries.get(safe);
        if (current==null) throw new IllegalArgumentException("OOXML part not found: "+safe);
        if (expectedSha256!=null && !expectedSha256.equals(sha256(current))) throw new IllegalStateException("OOXML precondition digest mismatch");
        if (safe.endsWith(".xml") || safe.endsWith(".rels")) parseXml(replacement);
        entries.put(safe,replacement.clone()); return write(entries);
    }

    public static byte[] applyMutationPlan(byte[] packageBytes, OoxmlMutationPlan plan) throws IOException {
        Objects.requireNonNull(packageBytes, "packageBytes");
        Objects.requireNonNull(plan, "plan");
        String actualPackage = sha256(packageBytes);
        if (!actualPackage.equals(plan.expectedPackageSha256())) {
            throw new IllegalStateException("OOXML package precondition digest mismatch");
        }
        Map<String,byte[]> entries = read(packageBytes);
        for (OoxmlMutationPlan.Mutation mutation : plan.mutations()) {
            String safe = safeName(mutation.partName());
            byte[] current = entries.get(safe);
            if (mutation.expectedPartSha256()!=null) {
                if (current==null || !mutation.expectedPartSha256().equals(sha256(current))) {
                    throw new IllegalStateException("OOXML part precondition digest mismatch: "+safe);
                }
            }
            switch (mutation.operation()) {
                case ADD -> {
                    if (current!=null) throw new IllegalStateException("OOXML part already exists: "+safe);
                    byte[] content=requiredMutationContent(mutation,safe); validatePartContent(safe,content); entries.put(safe,content);
                }
                case REPLACE -> {
                    if (current==null) throw new IllegalStateException("OOXML part not found: "+safe);
                    byte[] content=requiredMutationContent(mutation,safe); validatePartContent(safe,content); entries.put(safe,content);
                }
                case DELETE -> {
                    if (current==null) throw new IllegalStateException("OOXML part not found: "+safe);
                    if (mutation.content()!=null) throw new IllegalArgumentException("DELETE mutation must not carry content: "+safe);
                    entries.remove(safe);
                }
            }
        }
        return write(entries);
    }

    private static byte[] requiredMutationContent(OoxmlMutationPlan.Mutation mutation, String safe) {
        byte[] content=mutation.content();
        if (content==null) throw new IllegalArgumentException("OOXML mutation content required: "+safe);
        return content;
    }

    private static void validatePartContent(String safe, byte[] content) throws IOException {
        if (safe.endsWith(".xml") || safe.endsWith(".rels")) parseXml(content);
    }

    public static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public static String safeName(String raw) throws IOException {
        if (raw==null || raw.isBlank() || raw.startsWith("/") || raw.startsWith("\\") || raw.contains("\\")) throw new IOException("unsafe OOXML part path");
        for (String p: raw.split("/")) if (p.equals(".")||p.equals("..")) throw new IOException("unsafe OOXML traversal");
        return raw;
    }
}
