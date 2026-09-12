#!/usr/bin/env python3
from pathlib import Path

root = Path('recovered/document/cr001-r4/source/01_CURRENT_DOCUMENT_PROCESSING_MODULE')
util = root / 'src/test/java/org/systemmaster/tools/document/PortableTestDocumentEffectAdmission.java'
util.parent.mkdir(parents=True, exist_ok=True)
util.write_text(r'''package org.systemmaster.tools.document;

import org.systemmaster.tools.document.spine.DocumentEffectAdmissionDecision;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionProvider;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** Qualifier-only explicit effect-admission provider. Never production authority. */
public final class PortableTestDocumentEffectAdmission {
    private static final String POLICY_REVISION = "documents-portable-test-effect-policy-r1";
    private static final String POLICY_DIGEST = sha("documents-portable-test-effect-policy-r1");

    private PortableTestDocumentEffectAdmission() {
    }

    public static DocumentEffectAdmissionProvider provider(Clock clock) {
        Objects.requireNonNull(clock, "clock");
        return (job, plan, sourceGraph) -> new DocumentEffectAdmissionDecision(
                DocumentEffectAdmissionDecision.SCHEMA_V1,
                "portable-test-effect-" + job.jobId(),
                DocumentEffectAdmissionDecision.Disposition.ALLOW,
                job.jobId(),
                job.mode(),
                sourceGraph.sourceSha256(),
                sourceGraph.semanticDigest(),
                plan.operation().intentDigest(),
                plan.digest(),
                DocumentEffectAdmissionDecision.capabilitySetDigest(plan),
                POLICY_REVISION,
                POLICY_DIGEST,
                "PORTABLE_TEST_ONLY_EXPLICIT_ALLOW",
                Instant.now(clock));
    }

    private static String sha(String material) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
''', encoding='utf-8')


def find_close(text: str, open_idx: int) -> int:
    depth = 0
    quote = None
    escape = False
    i = open_idx
    while i < len(text):
        ch = text[i]
        if quote is not None:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
        else:
            if ch in ('"', "'"):
                quote = ch
            elif ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    raise RuntimeError('unbalanced UniversalDocumentSpine constructor')


def split_top_level(content: str):
    parts = []
    start = 0
    depth = 0
    quote = None
    escape = False
    for i, ch in enumerate(content):
        if quote is not None:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                quote = None
            continue
        if ch in ('"', "'"):
            quote = ch
        elif ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        elif ch == ',' and depth == 0:
            parts.append(content[start:i])
            start = i + 1
    parts.append(content[start:])
    return parts


changed = []
total_rebound = 0
for path in sorted((root / 'src/test/java').rglob('*.java')):
    if path.name in {'DocumentSpine002APortableTests.java', 'PortableTestDocumentEffectAdmission.java'}:
        continue
    text = path.read_text(encoding='utf-8')
    needle = 'new UniversalDocumentSpine('
    pos = 0
    out = []
    last = 0
    rebound = 0
    while True:
        idx = text.find(needle, pos)
        if idx < 0:
            break
        open_idx = idx + len(needle) - 1
        close_idx = find_close(text, open_idx)
        content = text[open_idx + 1:close_idx]
        parts = split_top_level(content)
        if len(parts) == 5:
            clock_expr = parts[4].strip()
            new_content = content + ',\n                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(' + clock_expr + ')'
            out.append(text[last:open_idx + 1])
            out.append(new_content)
            out.append(')')
            last = close_idx + 1
            rebound += 1
            total_rebound += 1
        pos = close_idx + 1
    if rebound:
        out.append(text[last:])
        path.write_text(''.join(out), encoding='utf-8')
        changed.append((str(path), rebound))

if total_rebound == 0:
    raise SystemExit('no five-argument portable UniversalDocumentSpine callers found to rebind')

print(f'rebound_callers={total_rebound}')
for path, count in changed:
    print(f'{count}\t{path}')
