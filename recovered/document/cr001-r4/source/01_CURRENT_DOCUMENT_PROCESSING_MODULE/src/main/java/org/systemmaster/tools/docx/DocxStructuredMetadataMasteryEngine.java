package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Typed DOCX T07 citations, generated tables, content controls, custom XML and metadata authority. */
public final class DocxStructuredMetadataMasteryEngine {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String W15 = "http://schemas.microsoft.com/office/word/2012/wordml";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CT = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String B = "http://schemas.openxmlformats.org/officeDocument/2006/bibliography";
    private static final String DS = "http://schemas.openxmlformats.org/officeDocument/2006/customXml";
    private static final String CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
    private static final String DC = "http://purl.org/dc/elements/1.1/";
    private static final String DCTERMS = "http://purl.org/dc/terms/";
    private static final String DCMITYPE = "http://purl.org/dc/dcmitype/";
    private static final String XSI = "http://www.w3.org/2001/XMLSchema-instance";
    private static final String EP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
    private static final String CPROP = "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties";
    private static final String VT = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
    private static final String CUSTOM_XML_PROPS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps";
    private static final String CORE_PROPS_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
    private static final String EXT_PROPS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
    private static final String CUSTOM_PROPS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";
    private static final String CUSTOM_PROPERTY_FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

    public enum GeneratedTableKind { TABLE_OF_CONTENTS, INDEX, TABLE_OF_FIGURES }
    public enum LegacyFormFieldType { TEXT, CHECKBOX, DROPDOWN }

    public record CitationSpec(String tag, String displayText, int localeId) {
        public CitationSpec {
            tag = token(tag, "citation tag", 128);
            displayText = clean(displayText);
            if (localeId <= 0) localeId = 1033;
        }
    }
    public record CitationSnapshot(String locator, CitationSpec spec, String instruction) {}

    public record BibliographySource(String tag, String sourceType, String title, String author, String year) {
        public BibliographySource {
            tag = token(tag, "bibliography tag", 128);
            sourceType = clean(sourceType).isBlank() ? "Misc" : clean(sourceType);
            title = clean(title);
            author = clean(author);
            year = clean(year);
        }
    }
    public record BibliographySnapshot(String locator, String instruction, List<BibliographySource> sources) {
        public BibliographySnapshot { sources = List.copyOf(Objects.requireNonNullElse(sources, List.of())); }
    }

    public record GeneratedTableSpec(GeneratedTableKind kind, String title, String instruction) {
        public GeneratedTableSpec {
            Objects.requireNonNull(kind, "kind");
            title = clean(title);
            instruction = clean(instruction);
            if (instruction.isBlank()) instruction = defaultGeneratedInstruction(kind);
            validateGeneratedInstruction(kind, instruction);
        }
    }
    public record GeneratedTableSnapshot(String locator, GeneratedTableSpec spec) {}

    public record ContentControlSpec(
            String alias,
            String tag,
            int id,
            String text,
            String lock,
            String storeItemId,
            String xpath,
            String prefixMappings) {
        public ContentControlSpec {
            alias = clean(alias);
            tag = clean(tag);
            text = Objects.requireNonNullElse(text, "");
            lock = clean(lock);
            storeItemId = clean(storeItemId);
            xpath = clean(xpath);
            prefixMappings = clean(prefixMappings);
            if (id < 0) throw new IllegalArgumentException("content-control id must be >= 0");
            if (!lock.isBlank() && !Set.of("sdtLocked", "contentLocked", "sdtContentLocked", "unlocked").contains(lock)) {
                throw new IllegalArgumentException("unsupported content-control lock");
            }
            if ((!storeItemId.isBlank() || !xpath.isBlank()) && (storeItemId.isBlank() || xpath.isBlank())) {
                throw new IllegalArgumentException("data binding requires storeItemId and xpath together");
            }
        }
    }
    public record ContentControlSnapshot(String locator, ContentControlSpec spec, boolean repeating, boolean repeatingItem) {}

    public record CustomXmlMappingSpec(String storeItemId, String xpath, String prefixMappings, String xml) {
        public CustomXmlMappingSpec {
            storeItemId = normalizeStoreItemId(storeItemId);
            xpath = clean(xpath);
            prefixMappings = clean(prefixMappings);
            xml = Objects.requireNonNullElse(xml, "").strip();
            if (xpath.isBlank()) throw new IllegalArgumentException("custom XML xpath required");
            if (xml.isBlank()) throw new IllegalArgumentException("custom XML payload required");
        }
    }
    public record CustomXmlMappingSnapshot(String locator, String itemPart, String propsPart, CustomXmlMappingSpec spec) {}

    public record LegacyFormFieldSpec(
            LegacyFormFieldType type,
            String name,
            String defaultText,
            boolean checked,
            List<String> dropdownItems,
            boolean enabled,
            boolean calculateOnExit) {
        public LegacyFormFieldSpec {
            Objects.requireNonNull(type, "type");
            name = token(name, "form field name", 64);
            defaultText = Objects.requireNonNullElse(defaultText, "");
            dropdownItems = List.copyOf(Objects.requireNonNullElse(dropdownItems, List.of()));
            for (String item : dropdownItems) if (clean(item).isBlank()) throw new IllegalArgumentException("blank dropdown item");
            if (type == LegacyFormFieldType.DROPDOWN && dropdownItems.isEmpty()) throw new IllegalArgumentException("dropdown requires items");
        }
    }
    public record LegacyFormFieldSnapshot(String locator, LegacyFormFieldSpec spec) {}

    public record PropertyValue(String name, String value) {
        public PropertyValue { name = token(name, "property name", 128); value = Objects.requireNonNullElse(value, ""); }
    }
    public record CustomPropertyValue(String name, String type, String value, int pid) {
        public CustomPropertyValue {
            name = token(name, "custom property name", 255);
            type = clean(type).toLowerCase(Locale.ROOT);
            value = Objects.requireNonNullElse(value, "");
            if (!Set.of("string", "integer", "double", "boolean", "date").contains(type)) throw new IllegalArgumentException("unsupported custom property type");
            if (pid < 0) throw new IllegalArgumentException("custom property pid must be >= 0");
            validateCustomPropertyValue(type, value);
        }
    }
    public record DocumentVariable(String name, String value) {
        public DocumentVariable { name = token(name, "document variable name", 255); value = Objects.requireNonNullElse(value, ""); }
    }

    public List<CitationSnapshot> readCitations(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<CitationSnapshot> out = new ArrayList<>();
        NodeList fields = doc.getElementsByTagNameNS(W, "fldSimple");
        int ordinal = 0;
        for (int i = 0; i < fields.getLength(); i++) {
            Element field = (Element) fields.item(i);
            String instruction = clean(attribute(field, W, "instr"));
            if (!firstToken(instruction).equals("CITATION")) continue;
            ordinal++;
            String tag = argumentAfterCommand(instruction);
            int lcid = integerSwitch(instruction, "\\l", 1033);
            out.add(new CitationSnapshot("citation:" + ordinal, new CitationSpec(tag, wordText(field), lcid), instruction));
        }
        return List.copyOf(out);
    }

    public byte[] insertCitation(byte[] bytes, String paragraphLocator, CitationSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element paragraph = locateParagraph(doc, paragraphLocator);
        Element field = simpleField(doc, "CITATION " + spec.tag() + " \\l " + spec.localeId(), spec.displayText().isBlank() ? "[" + spec.tag() + "]" : spec.displayText());
        paragraph.appendChild(field);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editCitation(byte[] bytes, String locator, CitationSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element field = locateNthField(doc, locator, "citation", "CITATION", false);
        setAttribute(field, W, "w:instr", "instr", "CITATION " + spec.tag() + " \\l " + spec.localeId());
        replaceFieldResult(field, spec.displayText().isBlank() ? "[" + spec.tag() + "]" : spec.displayText());
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<BibliographySource> readBibliographySources(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        ArrayList<BibliographySource> out = new ArrayList<>();
        for (Map.Entry<String, byte[]> entry : parts.entrySet()) {
            if (!entry.getKey().startsWith("customXml/") || !entry.getKey().endsWith(".xml") || entry.getKey().contains("itemProps")) continue;
            Document d;
            try { d = OoxmlPackageSupport.parseXml(entry.getValue()); } catch (IOException ex) { continue; }
            Element root = d.getDocumentElement();
            if (root == null || !B.equals(root.getNamespaceURI())) continue;
            NodeList sources = d.getElementsByTagNameNS(B, "Source");
            for (int i = 0; i < sources.getLength(); i++) out.add(parseBibliographySource((Element) sources.item(i)));
        }
        return List.copyOf(out);
    }

    public List<BibliographySnapshot> readBibliographies(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        List<BibliographySource> sources = readBibliographySources(bytes);
        ArrayList<BibliographySnapshot> out = new ArrayList<>();
        NodeList fields = doc.getElementsByTagNameNS(W, "fldSimple");
        int ordinal = 0;
        for (int i = 0; i < fields.getLength(); i++) {
            Element field = (Element) fields.item(i);
            String instruction = clean(attribute(field, W, "instr"));
            if (!firstToken(instruction).equals("BIBLIOGRAPHY")) continue;
            ordinal++;
            out.add(new BibliographySnapshot("bibliography:" + ordinal, instruction, sources));
        }
        return List.copyOf(out);
    }

    public byte[] upsertBibliographySource(byte[] bytes, BibliographySource source) throws IOException {
        Objects.requireNonNull(source, "source");
        Map<String, byte[]> parts = requireDocx(bytes);
        BibliographyPart bibliography = bibliographyPart(parts, true);
        Document d = bibliography.document();
        Element match = null;
        NodeList sources = d.getElementsByTagNameNS(B, "Source");
        for (int i = 0; i < sources.getLength(); i++) {
            Element candidate = (Element) sources.item(i);
            if (source.tag().equals(childText(candidate, B, "Tag"))) { match = candidate; break; }
        }
        Element replacement = bibliographySourceElement(d, source);
        if (match == null) d.getDocumentElement().appendChild(replacement); else match.getParentNode().replaceChild(replacement, match);
        parts.put(bibliography.part(), OoxmlPackageSupport.serialize(d));
        ensureDefaultContentType(parts, "xml", "application/xml");
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] insertBibliography(byte[] bytes, String paragraphLocator) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        locateParagraph(doc, paragraphLocator).appendChild(simpleField(doc, "BIBLIOGRAPHY", "Bibliography"));
        setUpdateFields(parts, true);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editBibliography(byte[] bytes, String locator, String instruction) throws IOException {
        instruction = clean(instruction);
        if (!firstToken(instruction).equals("BIBLIOGRAPHY")) throw new IllegalArgumentException("bibliography instruction must start BIBLIOGRAPHY");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element field = locateNthField(doc, locator, "bibliography", "BIBLIOGRAPHY", false);
        setAttribute(field, W, "w:instr", "instr", instruction);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        setUpdateFields(parts, true);
        return OoxmlPackageSupport.write(parts);
    }

    public List<GeneratedTableSnapshot> readGeneratedTables(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<GeneratedTableSnapshot> out = new ArrayList<>();
        NodeList fields = doc.getElementsByTagNameNS(W, "fldSimple");
        int toc = 0, index = 0, tof = 0;
        for (int i = 0; i < fields.getLength(); i++) {
            Element field = (Element) fields.item(i);
            String instruction = clean(attribute(field, W, "instr"));
            GeneratedTableKind kind = generatedKind(instruction);
            if (kind == null) continue;
            int n = switch (kind) {
                case TABLE_OF_CONTENTS -> ++toc;
                case INDEX -> ++index;
                case TABLE_OF_FIGURES -> ++tof;
            };
            String prefix = switch (kind) { case TABLE_OF_CONTENTS -> "toc"; case INDEX -> "index"; case TABLE_OF_FIGURES -> "table-of-figures"; };
            out.add(new GeneratedTableSnapshot(prefix + ":" + n, new GeneratedTableSpec(kind, wordText(field), instruction)));
        }
        return List.copyOf(out);
    }

    public byte[] insertGeneratedTable(byte[] bytes, String paragraphLocator, GeneratedTableSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        locateParagraph(doc, paragraphLocator).appendChild(simpleField(doc, spec.instruction(), spec.title().isBlank() ? defaultGeneratedTitle(spec.kind()) : spec.title()));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        setUpdateFields(parts, true);
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editGeneratedTable(byte[] bytes, String locator, GeneratedTableSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        String prefix = switch (spec.kind()) { case TABLE_OF_CONTENTS -> "toc"; case INDEX -> "index"; case TABLE_OF_FIGURES -> "table-of-figures"; };
        String command = spec.kind() == GeneratedTableKind.INDEX ? "INDEX" : "TOC";
        Element field = locateNthField(doc, locator, prefix, command, spec.kind() == GeneratedTableKind.TABLE_OF_FIGURES);
        setAttribute(field, W, "w:instr", "instr", spec.instruction());
        replaceFieldResult(field, spec.title().isBlank() ? defaultGeneratedTitle(spec.kind()) : spec.title());
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        setUpdateFields(parts, true);
        return OoxmlPackageSupport.write(parts);
    }

    public List<ContentControlSnapshot> readContentControls(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<ContentControlSnapshot> out = new ArrayList<>();
        NodeList controls = doc.getElementsByTagNameNS(W, "sdt");
        int ordinal = 0;
        for (int i = 0; i < controls.getLength(); i++) {
            Element sdt = (Element) controls.item(i);
            if (hasAncestor(sdt, W, "sdt")) continue;
            ordinal++;
            Element pr = firstDirect(sdt, W, "sdtPr");
            boolean repeating = pr != null && pr.getElementsByTagNameNS(W15, "repeatingSection").getLength() > 0;
            boolean repeatingItem = pr != null && pr.getElementsByTagNameNS(W15, "repeatingSectionItem").getLength() > 0;
            ContentControlSpec spec = parseContentControl(pr, sdt);
            out.add(new ContentControlSnapshot("content-control:" + ordinal, spec, repeating, repeatingItem));
        }
        return List.copyOf(out);
    }

    public byte[] insertContentControl(byte[] bytes, String paragraphLocator, ContentControlSpec spec, boolean repeating) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element host = locateParagraph(doc, paragraphLocator);
        Element sdt = contentControlElement(doc, spec, repeating, false);
        insertAfter(host, sdt);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editContentControl(byte[] bytes, String locator, ContentControlSpec spec, boolean repeating) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element current = locateContentControl(doc, locator);
        Element pr = firstDirect(current, W, "sdtPr");
        if (pr == null) { pr = doc.createElementNS(W, "w:sdtPr"); current.insertBefore(pr, current.getFirstChild()); }
        upsertContentControlProperties(doc, pr, spec, repeating);
        Element content = firstDirect(current, W, "sdtContent");
        if (content == null) { content = doc.createElementNS(W, "w:sdtContent"); current.appendChild(content); }
        replaceSimpleContentControlText(doc, content, spec.text());
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<CustomXmlMappingSnapshot> readCustomXmlMappings(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        ArrayList<CustomXmlMappingSnapshot> out = new ArrayList<>();
        for (String propsPart : parts.keySet().stream().filter(n -> n.matches("customXml/itemProps[0-9]+\\.xml")).sorted().toList()) {
            Document props = OoxmlPackageSupport.parseXml(parts.get(propsPart));
            Element dataStore = props.getDocumentElement();
            if (dataStore == null || !DS.equals(dataStore.getNamespaceURI())) continue;
            String storeItemId = normalizeStoreItemId(dataStore.getAttributeNS(DS, "itemID"));
            String suffix = propsPart.substring("customXml/itemProps".length(), propsPart.length() - 4);
            String itemPart = "customXml/item" + suffix + ".xml";
            byte[] itemBytes = parts.get(itemPart);
            if (itemBytes == null) continue;
            String xml = new String(itemBytes, StandardCharsets.UTF_8);
            BindingUse binding = firstBindingForStore(parts, storeItemId);
            CustomXmlMappingSpec spec = new CustomXmlMappingSpec(storeItemId, binding.xpath().isBlank() ? "/" : binding.xpath(), binding.prefixMappings(), xml);
            out.add(new CustomXmlMappingSnapshot("custom-xml:" + suffix, itemPart, propsPart, spec));
        }
        return List.copyOf(out);
    }

    public byte[] createCustomXmlMapping(byte[] bytes, CustomXmlMappingSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        parseStandaloneXml(spec.xml());
        int n = nextCustomXmlIndex(parts);
        String item = "customXml/item" + n + ".xml";
        String props = "customXml/itemProps" + n + ".xml";
        parts.put(item, spec.xml().getBytes(StandardCharsets.UTF_8));
        parts.put(props, customXmlProperties(spec.storeItemId()));
        parts.put("customXml/_rels/item" + n + ".xml.rels", relationshipsXml("rId1", CUSTOM_XML_PROPS_REL, "itemProps" + n + ".xml", false));
        ensureDefaultContentType(parts, "xml", "application/xml");
        ensureOverrideContentType(parts, "/" + props, "application/vnd.openxmlformats-officedocument.customXmlProperties+xml");
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editCustomXmlMapping(byte[] bytes, String locator, CustomXmlMappingSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        if (!locator.matches("custom-xml:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe custom XML locator: " + locator);
        parseStandaloneXml(spec.xml());
        int n = Integer.parseInt(locator.substring("custom-xml:".length()));
        Map<String, byte[]> parts = requireDocx(bytes);
        String item = "customXml/item" + n + ".xml";
        String props = "customXml/itemProps" + n + ".xml";
        if (!parts.containsKey(item) || !parts.containsKey(props)) throw new IllegalArgumentException("custom XML mapping not found: " + locator);
        String oldStore = storeItemId(parts.get(props));
        int uses = bindingUseCount(parts, oldStore);
        if (uses > 1 && !oldStore.equalsIgnoreCase(spec.storeItemId())) {
            throw new IllegalArgumentException("shared custom XML mapping storeItemId cannot be changed without owner-scoped rebinding");
        }
        parts.put(item, spec.xml().getBytes(StandardCharsets.UTF_8));
        parts.put(props, customXmlProperties(spec.storeItemId()));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] bindContentControl(byte[] bytes, String contentControlLocator, CustomXmlMappingSpec mapping) throws IOException {
        Objects.requireNonNull(mapping, "mapping");
        Map<String, byte[]> parts = requireDocx(bytes);
        if (readCustomXmlMappings(bytes).stream().noneMatch(m -> m.spec().storeItemId().equalsIgnoreCase(mapping.storeItemId()))) {
            bytes = createCustomXmlMapping(bytes, mapping);
            parts = requireDocx(bytes);
        }
        Document doc = document(parts);
        Element sdt = locateContentControl(doc, contentControlLocator);
        Element pr = firstDirect(sdt, W, "sdtPr");
        if (pr == null) { pr = doc.createElementNS(W, "w:sdtPr"); sdt.insertBefore(pr, sdt.getFirstChild()); }
        removeDirect(pr, W, "dataBinding");
        Element binding = doc.createElementNS(W, "w:dataBinding");
        setAttribute(binding, W, "w:storeItemID", "storeItemID", mapping.storeItemId());
        setAttribute(binding, W, "w:xpath", "xpath", mapping.xpath());
        if (!mapping.prefixMappings().isBlank()) setAttribute(binding, W, "w:prefixMappings", "prefixMappings", mapping.prefixMappings());
        pr.appendChild(binding);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<LegacyFormFieldSnapshot> readLegacyFormFields(byte[] bytes) throws IOException {
        Document doc = document(requireDocx(bytes));
        ArrayList<LegacyFormFieldSnapshot> out = new ArrayList<>();
        NodeList ff = doc.getElementsByTagNameNS(W, "ffData");
        for (int i = 0; i < ff.getLength(); i++) {
            Element data = (Element) ff.item(i);
            Element run = ancestor(data, W, "r");
            Element paragraph = ancestor(data, W, "p");
            LegacyFormFieldSpec spec = parseLegacyFormField(data);
            out.add(new LegacyFormFieldSnapshot("legacy-form:" + (i + 1), spec));
            if (run == null || paragraph == null) throw new IOException("legacy form field has invalid ownership");
        }
        return List.copyOf(out);
    }

    public byte[] insertLegacyFormField(byte[] bytes, String paragraphLocator, LegacyFormFieldSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        Element paragraph = locateParagraph(doc, paragraphLocator);
        for (Element run : legacyFieldRuns(doc, spec)) paragraph.appendChild(run);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editLegacyFormField(byte[] bytes, String locator, LegacyFormFieldSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        if (!locator.matches("legacy-form:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe legacy form locator: " + locator);
        int index = Integer.parseInt(locator.substring("legacy-form:".length()));
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = document(parts);
        NodeList ff = doc.getElementsByTagNameNS(W, "ffData");
        if (index > ff.getLength()) throw new IllegalArgumentException("legacy form field not found: " + locator);
        Element data = (Element) ff.item(index - 1);
        Element beginRun = ancestor(data, W, "r");
        Element paragraph = ancestor(data, W, "p");
        if (beginRun == null || paragraph == null) throw new IOException("legacy form field has invalid ownership");
        ComplexRunRange range = locateFieldRunRange(paragraph, beginRun);
        List<Element> replacement = legacyFieldRuns(doc, spec);
        Node insertBefore = range.after();
        for (Element old : range.runs()) paragraph.removeChild(old);
        for (Element run : replacement) paragraph.insertBefore(run, insertBefore);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<PropertyValue> readDocumentProperties(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        ArrayList<PropertyValue> out = new ArrayList<>();
        if (parts.containsKey("docProps/core.xml")) addLeafProperties(out, OoxmlPackageSupport.parseXml(parts.get("docProps/core.xml")), "core.");
        if (parts.containsKey("docProps/app.xml")) addLeafProperties(out, OoxmlPackageSupport.parseXml(parts.get("docProps/app.xml")), "app.");
        return List.copyOf(out);
    }

    public byte[] upsertDocumentProperty(byte[] bytes, PropertyValue property) throws IOException {
        Objects.requireNonNull(property, "property");
        Map<String, byte[]> parts = requireDocx(bytes);
        String name = property.name();
        if (name.startsWith("core.")) upsertCoreProperty(parts, name.substring(5), property.value());
        else if (name.startsWith("app.")) upsertExtendedProperty(parts, name.substring(4), property.value());
        else throw new IllegalArgumentException("document property must use core. or app. prefix");
        return OoxmlPackageSupport.write(parts);
    }

    public List<CustomPropertyValue> readCustomProperties(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        if (!parts.containsKey("docProps/custom.xml")) return List.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("docProps/custom.xml"));
        ArrayList<CustomPropertyValue> out = new ArrayList<>();
        NodeList props = d.getElementsByTagNameNS(CPROP, "property");
        for (int i = 0; i < props.getLength(); i++) {
            Element p = (Element) props.item(i);
            Element value = firstElementChild(p);
            if (value == null) continue;
            String type = vtType(value.getLocalName());
            out.add(new CustomPropertyValue(p.getAttribute("name"), type, clean(value.getTextContent()), parseInt(p.getAttribute("pid"), 0)));
        }
        return List.copyOf(out);
    }

    public byte[] upsertCustomProperty(byte[] bytes, CustomPropertyValue property) throws IOException {
        Objects.requireNonNull(property, "property");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document d = customPropertiesDocument(parts);
        Element existing = null;
        int maxPid = 1;
        NodeList props = d.getElementsByTagNameNS(CPROP, "property");
        for (int i = 0; i < props.getLength(); i++) {
            Element p = (Element) props.item(i);
            maxPid = Math.max(maxPid, parseInt(p.getAttribute("pid"), 1));
            if (property.name().equals(p.getAttribute("name"))) existing = p;
        }
        int pid = existing == null ? (property.pid() > 1 ? property.pid() : maxPid + 1) : parseInt(existing.getAttribute("pid"), maxPid + 1);
        Element replacement = customPropertyElement(d, new CustomPropertyValue(property.name(), property.type(), property.value(), pid));
        if (existing == null) d.getDocumentElement().appendChild(replacement); else existing.getParentNode().replaceChild(replacement, existing);
        parts.put("docProps/custom.xml", OoxmlPackageSupport.serialize(d));
        ensureOverrideContentType(parts, "/docProps/custom.xml", "application/vnd.openxmlformats-officedocument.custom-properties+xml");
        ensurePackageRelationship(parts, CUSTOM_PROPS_REL, "docProps/custom.xml");
        return OoxmlPackageSupport.write(parts);
    }

    public List<DocumentVariable> readDocumentVariables(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        if (!parts.containsKey("word/settings.xml")) return List.of();
        Document d = OoxmlPackageSupport.parseXml(parts.get("word/settings.xml"));
        ArrayList<DocumentVariable> out = new ArrayList<>();
        NodeList vars = d.getElementsByTagNameNS(W, "docVar");
        for (int i = 0; i < vars.getLength(); i++) {
            Element var = (Element) vars.item(i);
            out.add(new DocumentVariable(attribute(var, W, "name"), attribute(var, W, "val")));
        }
        return List.copyOf(out);
    }

    public byte[] upsertDocumentVariable(byte[] bytes, DocumentVariable variable) throws IOException {
        Objects.requireNonNull(variable, "variable");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document settings = settingsDocument(parts);
        Element root = settings.getDocumentElement();
        Element vars = firstDirect(root, W, "docVars");
        if (vars == null) { vars = settings.createElementNS(W, "w:docVars"); root.appendChild(vars); }
        Element existing = null;
        for (Element v : directChildren(vars, W, "docVar")) if (variable.name().equals(attribute(v, W, "name"))) { existing = v; break; }
        if (existing == null) { existing = settings.createElementNS(W, "w:docVar"); vars.appendChild(existing); }
        setAttribute(existing, W, "w:name", "name", variable.name());
        setAttribute(existing, W, "w:val", "val", variable.value());
        parts.put("word/settings.xml", OoxmlPackageSupport.serialize(settings));
        ensureOverrideContentType(parts, "/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml");
        ensureDocumentRelationship(parts, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings", "settings.xml");
        return OoxmlPackageSupport.write(parts);
    }

    private static void upsertContentControlProperties(Document doc, Element pr, ContentControlSpec spec, boolean repeating) {
        for (String local : List.of("alias", "tag", "id", "lock", "dataBinding")) removeDirect(pr, W, local);
        removeDirect(pr, W15, "repeatingSection");
        if (!spec.alias().isBlank()) appendVal(doc, pr, W, "w:alias", spec.alias());
        if (!spec.tag().isBlank()) appendVal(doc, pr, W, "w:tag", spec.tag());
        appendVal(doc, pr, W, "w:id", Integer.toString(spec.id() == 0 ? Math.abs(Objects.hash(spec.alias(), spec.tag(), spec.text())) : spec.id()));
        if (!spec.lock().isBlank() && !"unlocked".equals(spec.lock())) appendVal(doc, pr, W, "w:lock", spec.lock());
        if (!spec.storeItemId().isBlank()) {
            Element binding = doc.createElementNS(W, "w:dataBinding");
            setAttribute(binding, W, "w:storeItemID", "storeItemID", normalizeStoreItemId(spec.storeItemId()));
            setAttribute(binding, W, "w:xpath", "xpath", spec.xpath());
            if (!spec.prefixMappings().isBlank()) setAttribute(binding, W, "w:prefixMappings", "prefixMappings", spec.prefixMappings());
            pr.appendChild(binding);
        }
        if (repeating) pr.appendChild(doc.createElementNS(W15, "w15:repeatingSection"));
    }

    private static void replaceSimpleContentControlText(Document doc, Element content, String text) {
        for (String complex : List.of("tbl", "drawing", "object", "sdt")) {
            if (content.getElementsByTagNameNS(W, complex).getLength() > 0) throw new IllegalArgumentException("content-control rich/complex content requires a specialized owner-preserving editor: " + complex);
        }
        if (content.getElementsByTagNameNS("http://schemas.openxmlformats.org/officeDocument/2006/math", "oMath").getLength() > 0) throw new IllegalArgumentException("content-control equation content requires specialized editor");
        List<Element> paragraphs = directChildren(content, W, "p");
        if (paragraphs.size() > 1) throw new IllegalArgumentException("multi-paragraph content-control text replacement requires specialized editor");
        Element p;
        if (paragraphs.isEmpty()) { p = doc.createElementNS(W, "w:p"); content.appendChild(p); } else p = paragraphs.get(0);
        for (Node n = p.getFirstChild(); n != null;) { Node next = n.getNextSibling(); if (n instanceof Element e && !(W.equals(e.getNamespaceURI()) && "pPr".equals(e.getLocalName()))) p.removeChild(n); n = next; }
        p.appendChild(textRun(doc, text));
    }

    private static ContentControlSpec parseContentControl(Element pr, Element sdt) {
        String alias = valueChild(pr, "alias");
        String tag = valueChild(pr, "tag");
        int id = parseInt(valueChild(pr, "id"), 0);
        String lock = valueChild(pr, "lock");
        Element binding = pr == null ? null : first(pr.getElementsByTagNameNS(W, "dataBinding"));
        String store = binding == null ? "" : attribute(binding, W, "storeItemID");
        String xpath = binding == null ? "" : attribute(binding, W, "xpath");
        String prefixes = binding == null ? "" : attribute(binding, W, "prefixMappings");
        return new ContentControlSpec(alias, tag, id, wordText(sdt), lock, store, xpath, prefixes);
    }

    private static Element contentControlElement(Document doc, ContentControlSpec spec, boolean repeating, boolean repeatingItem) {
        Element sdt = doc.createElementNS(W, "w:sdt");
        Element pr = doc.createElementNS(W, "w:sdtPr");
        upsertContentControlProperties(doc, pr, spec, repeating);
        if (repeatingItem) pr.appendChild(doc.createElementNS(W15, "w15:repeatingSectionItem"));
        sdt.appendChild(pr);
        Element content = doc.createElementNS(W, "w:sdtContent");
        Element p = doc.createElementNS(W, "w:p");
        p.appendChild(textRun(doc, spec.text()));
        content.appendChild(p);
        sdt.appendChild(content);
        return sdt;
    }

    private static LegacyFormFieldSpec parseLegacyFormField(Element data) {
        String name = valueChild(data, "name");
        boolean enabled = firstDirect(data, W, "enabled") != null;
        boolean calc = firstDirect(data, W, "calcOnExit") != null;
        Element text = firstDirect(data, W, "textInput");
        if (text != null) return new LegacyFormFieldSpec(LegacyFormFieldType.TEXT, name, valueChild(text, "default"), false, List.of(), enabled, calc);
        Element checkbox = firstDirect(data, W, "checkBox");
        if (checkbox != null) return new LegacyFormFieldSpec(LegacyFormFieldType.CHECKBOX, name, "", booleanChild(checkbox, "checked") || booleanChild(checkbox, "default"), List.of(), enabled, calc);
        Element dropdown = firstDirect(data, W, "ddList");
        ArrayList<String> items = new ArrayList<>();
        if (dropdown != null) for (Element item : directChildren(dropdown, W, "listEntry")) items.add(attribute(item, W, "val"));
        String def = dropdown == null ? "" : valueChild(dropdown, "result");
        return new LegacyFormFieldSpec(LegacyFormFieldType.DROPDOWN, name, def, false, items, enabled, calc);
    }

    private static List<Element> legacyFieldRuns(Document doc, LegacyFormFieldSpec spec) {
        Element begin = doc.createElementNS(W, "w:r");
        Element fld = doc.createElementNS(W, "w:fldChar"); setAttribute(fld, W, "w:fldCharType", "fldCharType", "begin");
        Element data = doc.createElementNS(W, "w:ffData");
        appendVal(doc, data, W, "w:name", spec.name());
        if (spec.enabled()) data.appendChild(doc.createElementNS(W, "w:enabled"));
        if (spec.calculateOnExit()) data.appendChild(doc.createElementNS(W, "w:calcOnExit"));
        switch (spec.type()) {
            case TEXT -> { Element text = doc.createElementNS(W, "w:textInput"); if (!spec.defaultText().isBlank()) appendVal(doc, text, W, "w:default", spec.defaultText()); data.appendChild(text); }
            case CHECKBOX -> { Element cb = doc.createElementNS(W, "w:checkBox"); Element sizeAuto = doc.createElementNS(W, "w:sizeAuto"); cb.appendChild(sizeAuto); if (spec.checked()) { Element checked = doc.createElementNS(W, "w:checked"); setAttribute(checked, W, "w:val", "val", "1"); cb.appendChild(checked); } data.appendChild(cb); }
            case DROPDOWN -> { Element dd = doc.createElementNS(W, "w:ddList"); for (String item : spec.dropdownItems()) appendVal(doc, dd, W, "w:listEntry", item); if (!spec.defaultText().isBlank()) appendVal(doc, dd, W, "w:result", spec.defaultText()); data.appendChild(dd); }
        }
        fld.appendChild(data); begin.appendChild(fld);
        String instruction = switch (spec.type()) { case TEXT -> " FORMTEXT "; case CHECKBOX -> " FORMCHECKBOX "; case DROPDOWN -> " FORMDROPDOWN "; };
        Element instr = doc.createElementNS(W, "w:r"); Element instrText = doc.createElementNS(W, "w:instrText"); instrText.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve"); instrText.setTextContent(instruction); instr.appendChild(instrText);
        Element separate = fieldCharRun(doc, "separate");
        Element result = textRun(doc, switch (spec.type()) { case TEXT -> spec.defaultText(); case CHECKBOX -> spec.checked() ? "☒" : "☐"; case DROPDOWN -> spec.defaultText().isBlank() ? spec.dropdownItems().get(0) : spec.defaultText(); });
        Element end = fieldCharRun(doc, "end");
        return List.of(begin, instr, separate, result, end);
    }

    private static ComplexRunRange locateFieldRunRange(Element paragraph, Element beginRun) throws IOException {
        ArrayList<Element> runs = new ArrayList<>();
        boolean started = false;
        int depth = 0;
        Node after = null;
        for (Node n = paragraph.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (!(n instanceof Element e) || !W.equals(e.getNamespaceURI()) || !"r".equals(e.getLocalName())) continue;
            if (e == beginRun) started = true;
            if (!started) continue;
            runs.add(e);
            NodeList chars = e.getElementsByTagNameNS(W, "fldChar");
            for (int i = 0; i < chars.getLength(); i++) {
                String type = attribute((Element) chars.item(i), W, "fldCharType");
                if ("begin".equals(type)) depth++;
                else if ("end".equals(type)) { depth--; if (depth == 0) { after = e.getNextSibling(); return new ComplexRunRange(List.copyOf(runs), after); } }
            }
        }
        throw new IOException("legacy field range is incomplete");
    }

    private static void addLeafProperties(List<PropertyValue> out, Document d, String prefix) {
        Element root = d.getDocumentElement();
        for (Node n = root.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && childElementCount(e) == 0) out.add(new PropertyValue(prefix + e.getLocalName(), clean(e.getTextContent())));
    }

    private static void upsertCoreProperty(Map<String, byte[]> parts, String local, String value) throws IOException {
        Document d = parts.containsKey("docProps/core.xml") ? OoxmlPackageSupport.parseXml(parts.get("docProps/core.xml")) : corePropertiesDocument();
        String ns = corePropertyNamespace(local);
        String prefix = ns.equals(DC) ? "dc" : ns.equals(DCTERMS) ? "dcterms" : "cp";
        Element target = firstDirect(d.getDocumentElement(), ns, local);
        if (target == null) { target = d.createElementNS(ns, prefix + ":" + local); d.getDocumentElement().appendChild(target); }
        target.setTextContent(value);
        if (ns.equals(DCTERMS) && ("created".equals(local) || "modified".equals(local))) target.setAttributeNS(XSI, "xsi:type", "dcterms:W3CDTF");
        parts.put("docProps/core.xml", OoxmlPackageSupport.serialize(d));
        ensureOverrideContentType(parts, "/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml");
        ensurePackageRelationship(parts, CORE_PROPS_REL, "docProps/core.xml");
    }

    private static void upsertExtendedProperty(Map<String, byte[]> parts, String local, String value) throws IOException {
        Document d = parts.containsKey("docProps/app.xml") ? OoxmlPackageSupport.parseXml(parts.get("docProps/app.xml")) : newXml("Properties", EP, "", Map.of("vt", VT));
        Element target = firstDirect(d.getDocumentElement(), EP, local);
        if (target == null) { target = d.createElementNS(EP, local); d.getDocumentElement().appendChild(target); }
        target.setTextContent(value);
        parts.put("docProps/app.xml", OoxmlPackageSupport.serialize(d));
        ensureOverrideContentType(parts, "/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml");
        ensurePackageRelationship(parts, EXT_PROPS_REL, "docProps/app.xml");
    }

    private static Document customPropertiesDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("docProps/custom.xml")) return OoxmlPackageSupport.parseXml(parts.get("docProps/custom.xml"));
        return newXml("Properties", CPROP, "", Map.of("vt", VT));
    }

    private static Element customPropertyElement(Document d, CustomPropertyValue value) {
        Element p = d.createElementNS(CPROP, "property"); p.setAttribute("fmtid", CUSTOM_PROPERTY_FMTID); p.setAttribute("pid", Integer.toString(value.pid())); p.setAttribute("name", value.name());
        String local = switch (value.type()) { case "string" -> "lpwstr"; case "integer" -> "i4"; case "double" -> "r8"; case "boolean" -> "bool"; case "date" -> "filetime"; default -> throw new IllegalArgumentException("unsupported custom property type"); };
        Element v = d.createElementNS(VT, "vt:" + local); v.setTextContent(value.value()); p.appendChild(v); return p;
    }

    private static Document corePropertiesDocument() throws IOException {
        return newXml("coreProperties", CP, "cp", Map.of("dc", DC, "dcterms", DCTERMS, "dcmitype", DCMITYPE, "xsi", XSI));
    }

    private static Document settingsDocument(Map<String, byte[]> parts) throws IOException {
        if (parts.containsKey("word/settings.xml")) return OoxmlPackageSupport.parseXml(parts.get("word/settings.xml"));
        return newXml("settings", W, "w", Map.of());
    }

    private static BibliographyPart bibliographyPart(Map<String, byte[]> parts, boolean create) throws IOException {
        for (String part : parts.keySet().stream().filter(n -> n.startsWith("customXml/") && n.endsWith(".xml") && !n.contains("itemProps")).sorted().toList()) {
            try {
                Document d = OoxmlPackageSupport.parseXml(parts.get(part));
                if (d.getDocumentElement() != null && B.equals(d.getDocumentElement().getNamespaceURI())) return new BibliographyPart(part, d);
            } catch (IOException ignored) { }
        }
        if (!create) return null;
        String part = nextCustomXmlItem(parts);
        Document d = newXml("Sources", B, "b", Map.of());
        d.getDocumentElement().setAttribute("SelectedStyle", "\\APASixthEditionOfficeOnline.xsl");
        return new BibliographyPart(part, d);
    }

    private static Element bibliographySourceElement(Document d, BibliographySource source) {
        Element s = d.createElementNS(B, "b:Source");
        appendText(d, s, B, "b:Tag", source.tag());
        appendText(d, s, B, "b:SourceType", source.sourceType());
        if (!source.title().isBlank()) appendText(d, s, B, "b:Title", source.title());
        if (!source.author().isBlank()) appendText(d, s, B, "b:Author", source.author());
        if (!source.year().isBlank()) appendText(d, s, B, "b:Year", source.year());
        return s;
    }

    private static BibliographySource parseBibliographySource(Element s) {
        return new BibliographySource(childText(s, B, "Tag"), childText(s, B, "SourceType"), childText(s, B, "Title"), childText(s, B, "Author"), childText(s, B, "Year"));
    }

    private static byte[] customXmlProperties(String storeItemId) throws IOException {
        Document d = newXml("datastoreItem", DS, "ds", Map.of());
        d.getDocumentElement().setAttributeNS(DS, "ds:itemID", normalizeStoreItemId(storeItemId));
        d.getDocumentElement().appendChild(d.createElementNS(DS, "ds:schemaRefs"));
        return OoxmlPackageSupport.serialize(d);
    }

    private static String storeItemId(byte[] propsBytes) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(propsBytes);
        return normalizeStoreItemId(d.getDocumentElement().getAttributeNS(DS, "itemID"));
    }

    private static BindingUse firstBindingForStore(Map<String, byte[]> parts, String storeId) throws IOException {
        Document doc = document(parts);
        NodeList bindings = doc.getElementsByTagNameNS(W, "dataBinding");
        for (int i = 0; i < bindings.getLength(); i++) {
            Element b = (Element) bindings.item(i);
            if (storeId.equalsIgnoreCase(normalizeStoreItemId(attribute(b, W, "storeItemID")))) return new BindingUse(attribute(b, W, "xpath"), attribute(b, W, "prefixMappings"));
        }
        return new BindingUse("/", "");
    }

    private static int bindingUseCount(Map<String, byte[]> parts, String storeId) throws IOException {
        Document doc = document(parts); int count = 0;
        NodeList bindings = doc.getElementsByTagNameNS(W, "dataBinding");
        for (int i = 0; i < bindings.getLength(); i++) if (storeId.equalsIgnoreCase(normalizeStoreItemId(attribute((Element) bindings.item(i), W, "storeItemID")))) count++;
        return count;
    }

    private static Element locateContentControl(Document doc, String locator) {
        if (!locator.matches("content-control:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe content-control locator: " + locator);
        int wanted = Integer.parseInt(locator.substring("content-control:".length())); int ordinal = 0;
        NodeList controls = doc.getElementsByTagNameNS(W, "sdt");
        for (int i = 0; i < controls.getLength(); i++) {
            Element sdt = (Element) controls.item(i); if (hasAncestor(sdt, W, "sdt")) continue; ordinal++; if (ordinal == wanted) return sdt;
        }
        throw new IllegalArgumentException("content control not found: " + locator);
    }

    private static Element locateNthField(Document doc, String locator, String prefix, String command, boolean requireFigureSwitch) {
        if (!locator.matches(java.util.regex.Pattern.quote(prefix) + ":[1-9][0-9]*")) throw new IllegalArgumentException("unsafe field locator: " + locator);
        int wanted = Integer.parseInt(locator.substring(prefix.length() + 1)); int ordinal = 0;
        NodeList fields = doc.getElementsByTagNameNS(W, "fldSimple");
        for (int i = 0; i < fields.getLength(); i++) {
            Element field = (Element) fields.item(i); String instruction = clean(attribute(field, W, "instr"));
            if (!firstToken(instruction).equals(command)) continue;
            if ("TOC".equals(command) && (instruction.toLowerCase(Locale.ROOT).contains("\\c") != requireFigureSwitch)) continue;
            ordinal++; if (ordinal == wanted) return field;
        }
        throw new IllegalArgumentException("field not found: " + locator);
    }

    private static GeneratedTableKind generatedKind(String instruction) {
        String first = firstToken(instruction);
        if ("INDEX".equals(first)) return GeneratedTableKind.INDEX;
        if (!"TOC".equals(first)) return null;
        return instruction.toLowerCase(Locale.ROOT).contains("\\c") ? GeneratedTableKind.TABLE_OF_FIGURES : GeneratedTableKind.TABLE_OF_CONTENTS;
    }

    private static String defaultGeneratedInstruction(GeneratedTableKind kind) {
        return switch (kind) {
            case TABLE_OF_CONTENTS -> "TOC \\o \"1-3\" \\h \\z \\u";
            case INDEX -> "INDEX \\e \"  \" \\h \"A\"";
            case TABLE_OF_FIGURES -> "TOC \\h \\z \\c \"Figure\"";
        };
    }

    private static String defaultGeneratedTitle(GeneratedTableKind kind) {
        return switch (kind) { case TABLE_OF_CONTENTS -> "Table of Contents"; case INDEX -> "Index"; case TABLE_OF_FIGURES -> "Table of Figures"; };
    }

    private static void validateGeneratedInstruction(GeneratedTableKind kind, String instruction) {
        GeneratedTableKind actual = generatedKind(instruction);
        if (actual != kind) throw new IllegalArgumentException("generated-table instruction does not match kind");
        String upper = instruction.toUpperCase(Locale.ROOT);
        if (upper.contains("DDE") || upper.contains("MACROBUTTON") || upper.contains("INCLUDETEXT") || upper.contains("INCLUDEPICTURE")) throw new IllegalArgumentException("effectful generated-table field blocked");
    }

    private static Element simpleField(Document doc, String instruction, String result) {
        Element field = doc.createElementNS(W, "w:fldSimple"); setAttribute(field, W, "w:instr", "instr", instruction); field.appendChild(textRun(doc, result)); return field;
    }

    private static Element textRun(Document doc, String text) {
        Element run = doc.createElementNS(W, "w:r"); Element t = doc.createElementNS(W, "w:t"); if (!text.isEmpty() && (Character.isWhitespace(text.charAt(0)) || Character.isWhitespace(text.charAt(text.length() - 1)))) t.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve"); t.setTextContent(text); run.appendChild(t); return run;
    }

    private static Element fieldCharRun(Document doc, String type) { Element run = doc.createElementNS(W, "w:r"); Element ch = doc.createElementNS(W, "w:fldChar"); setAttribute(ch, W, "w:fldCharType", "fldCharType", type); run.appendChild(ch); return run; }
    private static void replaceFieldResult(Element field, String text) { while (field.getFirstChild() != null) field.removeChild(field.getFirstChild()); field.appendChild(textRun(field.getOwnerDocument(), text)); }

    private static void setUpdateFields(Map<String, byte[]> parts, boolean enabled) throws IOException {
        Document settings = settingsDocument(parts); Element root = settings.getDocumentElement(); Element update = firstDirect(root, W, "updateFields"); if (update == null) { update = settings.createElementNS(W, "w:updateFields"); root.appendChild(update); } setAttribute(update, W, "w:val", "val", enabled ? "true" : "false"); parts.put("word/settings.xml", OoxmlPackageSupport.serialize(settings)); ensureOverrideContentType(parts, "/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"); ensureDocumentRelationship(parts, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings", "settings.xml");
    }

    private static void ensurePackageRelationship(Map<String, byte[]> parts, String type, String target) throws IOException {
        Document rels = parts.containsKey("_rels/.rels") ? OoxmlPackageSupport.parseXml(parts.get("_rels/.rels")) : newXml("Relationships", REL, "", Map.of());
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < list.getLength(); i++) if (type.equals(((Element) list.item(i)).getAttribute("Type"))) { ((Element) list.item(i)).setAttribute("Target", target); parts.put("_rels/.rels", OoxmlPackageSupport.serialize(rels)); return; }
        Element relationship = rels.createElementNS(REL, "Relationship"); relationship.setAttribute("Id", nextRelationshipId(rels)); relationship.setAttribute("Type", type); relationship.setAttribute("Target", target); rels.getDocumentElement().appendChild(relationship); parts.put("_rels/.rels", OoxmlPackageSupport.serialize(rels));
    }

    private static void ensureDocumentRelationship(Map<String, byte[]> parts, String type, String target) throws IOException {
        String name = "word/_rels/document.xml.rels"; Document rels = parts.containsKey(name) ? OoxmlPackageSupport.parseXml(parts.get(name)) : newXml("Relationships", REL, "", Map.of());
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < list.getLength(); i++) if (type.equals(((Element) list.item(i)).getAttribute("Type"))) { parts.put(name, OoxmlPackageSupport.serialize(rels)); return; }
        Element relationship = rels.createElementNS(REL, "Relationship"); relationship.setAttribute("Id", nextRelationshipId(rels)); relationship.setAttribute("Type", type); relationship.setAttribute("Target", target); rels.getDocumentElement().appendChild(relationship); parts.put(name, OoxmlPackageSupport.serialize(rels));
    }

    private static void ensureDefaultContentType(Map<String, byte[]> parts, String extension, String mime) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(parts, "[Content_Types].xml")); NodeList defaults = d.getElementsByTagNameNS(CT, "Default");
        for (int i = 0; i < defaults.getLength(); i++) if (extension.equalsIgnoreCase(((Element) defaults.item(i)).getAttribute("Extension"))) return;
        Element e = d.createElementNS(CT, "Default"); e.setAttribute("Extension", extension); e.setAttribute("ContentType", mime); d.getDocumentElement().appendChild(e); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }

    private static void ensureOverrideContentType(Map<String, byte[]> parts, String part, String mime) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(parts, "[Content_Types].xml")); NodeList overrides = d.getElementsByTagNameNS(CT, "Override");
        for (int i = 0; i < overrides.getLength(); i++) if (part.equals(((Element) overrides.item(i)).getAttribute("PartName"))) { ((Element) overrides.item(i)).setAttribute("ContentType", mime); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d)); return; }
        Element e = d.createElementNS(CT, "Override"); e.setAttribute("PartName", part); e.setAttribute("ContentType", mime); d.getDocumentElement().appendChild(e); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }

    private static Document document(Map<String, byte[]> parts) throws IOException { return OoxmlPackageSupport.parseXml(required(parts, "word/document.xml")); }
    private static Map<String, byte[]> requireDocx(byte[] bytes) throws IOException { Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(bytes)); required(parts, "[Content_Types].xml"); required(parts, "word/document.xml"); return parts; }
    private static byte[] required(Map<String, byte[]> parts, String name) throws IOException { byte[] value = parts.get(name); if (value == null) throw new IOException("missing OOXML part: " + name); return value; }

    private static Element locateParagraph(Document doc, String locator) {
        if (locator == null || !locator.matches("body/p:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe paragraph locator: " + locator);
        int wanted = Integer.parseInt(locator.substring("body/p:".length())); Element body = first(doc.getElementsByTagNameNS(W, "body")); if (body == null) throw new IllegalArgumentException("document body missing"); int n = 0;
        for (Node node = body.getFirstChild(); node != null; node = node.getNextSibling()) if (node instanceof Element e && W.equals(e.getNamespaceURI()) && "p".equals(e.getLocalName())) { if (++n == wanted) return e; }
        throw new IllegalArgumentException("paragraph locator out of range");
    }

    private static void insertAfter(Node current, Node next) { Node parent = current.getParentNode(); Node sibling = current.getNextSibling(); if (sibling == null) parent.appendChild(next); else parent.insertBefore(next, sibling); }
    private static void removeDirect(Element parent, String ns, String local) { for (Node n = parent.getFirstChild(); n != null;) { Node next = n.getNextSibling(); if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) parent.removeChild(n); n = next; } }
    private static Element firstDirect(Element parent, String ns, String local) { if (parent == null) return null; for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static List<Element> directChildren(Element parent, String ns, String local) { ArrayList<Element> out = new ArrayList<>(); if (parent != null) for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) out.add(e); return List.copyOf(out); }
    private static Element ancestor(Node node, String ns, String local) { for (Node p = node.getParentNode(); p != null; p = p.getParentNode()) if (p instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static boolean hasAncestor(Node node, String ns, String local) { return ancestor(node, ns, local) != null; }
    private static Element first(NodeList list) { return list == null || list.getLength() == 0 ? null : (Element) list.item(0); }
    private static Element firstElementChild(Element parent) { if (parent == null) return null; for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e) return e; return null; }
    private static int childElementCount(Element parent) { int count = 0; for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element) count++; return count; }

    private static String wordText(Element element) { if (element == null) return ""; NodeList texts = element.getElementsByTagNameNS(W, "t"); StringBuilder out = new StringBuilder(); for (int i = 0; i < texts.getLength(); i++) out.append(Objects.requireNonNullElse(texts.item(i).getTextContent(), "")); return out.toString(); }
    private static String childText(Element parent, String ns, String local) { Element e = firstDirect(parent, ns, local); return e == null ? "" : clean(e.getTextContent()); }
    private static String valueChild(Element parent, String local) { Element e = firstDirect(parent, W, local); return e == null ? "" : attribute(e, W, "val"); }
    private static boolean booleanChild(Element parent, String local) { Element e = firstDirect(parent, W, local); if (e == null) return false; String v = attribute(e, W, "val"); return v.isBlank() || "1".equals(v) || "true".equalsIgnoreCase(v) || "on".equalsIgnoreCase(v); }
    private static void appendVal(Document d, Element parent, String ns, String qname, String value) { Element e = d.createElementNS(ns, qname); setAttribute(e, ns, qname.substring(0, qname.indexOf(':') + 1) + "val", "val", value); parent.appendChild(e); }
    private static Element appendText(Document d, Element parent, String ns, String qname, String value) { Element e = d.createElementNS(ns, qname); e.setTextContent(value); parent.appendChild(e); return e; }
    private static String attribute(Element e, String ns, String local) { if (e == null) return ""; String value = e.getAttributeNS(ns, local); if (value.isBlank()) value = e.getAttribute(local); return clean(value); }
    private static void setAttribute(Element e, String ns, String qname, String local, String value) { e.setAttributeNS(ns, qname, Objects.requireNonNullElse(value, "")); if (!e.hasAttributeNS(ns, local)) e.setAttributeNS(ns, qname, Objects.requireNonNullElse(value, "")); }

    private static int nextCustomXmlIndex(Map<String, byte[]> parts) { int n = 1; while (parts.containsKey("customXml/item" + n + ".xml") || parts.containsKey("customXml/itemProps" + n + ".xml")) n++; return n; }
    private static String nextCustomXmlItem(Map<String, byte[]> parts) { return "customXml/item" + nextCustomXmlIndex(parts) + ".xml"; }
    private static String nextRelationshipId(Document rels) { LinkedHashSet<String> ids = new LinkedHashSet<>(); NodeList list = rels.getElementsByTagNameNS(REL, "Relationship"); for (int i = 0; i < list.getLength(); i++) ids.add(((Element) list.item(i)).getAttribute("Id")); int n = 1; while (ids.contains("rId" + n)) n++; return "rId" + n; }
    private static byte[] relationshipsXml(String id, String type, String target, boolean external) throws IOException { Document d = newXml("Relationships", REL, "", Map.of()); Element r = d.createElementNS(REL, "Relationship"); r.setAttribute("Id", id); r.setAttribute("Type", type); r.setAttribute("Target", target); if (external) r.setAttribute("TargetMode", "External"); d.getDocumentElement().appendChild(r); return OoxmlPackageSupport.serialize(d); }

    private static Document newXml(String local, String ns, String prefix, Map<String, String> namespaces) throws IOException {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance(); f.setNamespaceAware(true); f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true); f.setFeature("http://xml.org/sax/features/external-general-entities", false); f.setFeature("http://xml.org/sax/features/external-parameter-entities", false); f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false); f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            Document d = f.newDocumentBuilder().newDocument(); String qname = prefix == null || prefix.isBlank() ? local : prefix + ":" + local; Element root = d.createElementNS(ns, qname); if (prefix != null && !prefix.isBlank()) root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:" + prefix, ns); else root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns", ns); for (Map.Entry<String, String> entry : namespaces.entrySet()) root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:" + entry.getKey(), entry.getValue()); d.appendChild(root); return d;
        } catch (Exception ex) { throw new IOException("cannot create XML document", ex); }
    }

    private static void parseStandaloneXml(String xml) throws IOException { OoxmlPackageSupport.parseXml(xml.getBytes(StandardCharsets.UTF_8)); }
    private static String normalizeStoreItemId(String raw) { String v = clean(raw); if (v.isBlank()) throw new IllegalArgumentException("storeItemId required"); if (!v.matches("\\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\}?")) throw new IllegalArgumentException("storeItemId must be GUID"); if (!v.startsWith("{")) v = "{" + v; if (!v.endsWith("}")) v = v + "}"; return v.toUpperCase(Locale.ROOT); }
    private static String token(String raw, String label, int max) { String v = clean(raw); if (v.isBlank() || v.length() > max || !v.matches("[A-Za-z0-9_.:-]+")) throw new IllegalArgumentException(label + " invalid"); return v; }
    private static String clean(String value) { return Objects.requireNonNullElse(value, "").strip(); }
    private static String firstToken(String instruction) { String v = clean(instruction); return v.isBlank() ? "" : v.split("\\s+", 2)[0].toUpperCase(Locale.ROOT); }
    private static String argumentAfterCommand(String instruction) { String v = clean(instruction); String[] parts = v.split("\\s+"); if (parts.length < 2) throw new IllegalArgumentException("field argument missing: " + instruction); return token(parts[1], "field argument", 128); }
    private static int integerSwitch(String instruction, String marker, int fallback) { String[] parts = clean(instruction).split("\\s+"); for (int i = 0; i + 1 < parts.length; i++) if (marker.equalsIgnoreCase(parts[i])) return parseInt(parts[i + 1], fallback); return fallback; }
    private static int parseInt(String v, int fallback) { try { return Integer.parseInt(clean(v)); } catch (NumberFormatException ex) { return fallback; } }
    private static String corePropertyNamespace(String local) { return switch (local) { case "title", "subject", "creator", "description", "language" -> DC; case "created", "modified" -> DCTERMS; default -> CP; }; }
    private static String vtType(String local) { return switch (local) { case "lpwstr", "lpstr", "bstr" -> "string"; case "i1", "i2", "i4", "i8", "int", "uint", "ui1", "ui2", "ui4", "ui8" -> "integer"; case "r4", "r8", "decimal" -> "double"; case "bool" -> "boolean"; case "filetime", "date" -> "date"; default -> "string"; }; }
    private static void validateCustomPropertyValue(String type, String value) { try { switch (type) { case "integer" -> Long.parseLong(value); case "double" -> Double.parseDouble(value); case "boolean" -> { if (!Set.of("true", "false", "1", "0").contains(value.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("invalid boolean custom property"); } case "date" -> Instant.parse(value); default -> { } } } catch (RuntimeException ex) { if (ex instanceof IllegalArgumentException iae && iae.getMessage() != null && iae.getMessage().startsWith("invalid boolean")) throw iae; throw new IllegalArgumentException("invalid custom property value for " + type, ex); } }

    private record BibliographyPart(String part, Document document) {}
    private record BindingUse(String xpath, String prefixMappings) {}
    private record ComplexRunRange(List<Element> runs, Node after) {}
}
