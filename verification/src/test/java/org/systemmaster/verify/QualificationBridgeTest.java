package org.systemmaster.verify;

import static org.junit.jupiter.api.Assertions.fail;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * Bridges the repository's main()-based qualification classes into the standard
 * `mvn test` phase.
 *
 * <p>Why this exists: the qualification classes are plain entry points with a
 * main(String[]), not JUnit suites. Nothing bound them to the test phase, so
 * `mvn test` printed BUILD SUCCESS having run zero tests. Anyone — human or CI —
 * asking "does the build pass?" got a meaningless yes. This class discovers those
 * classes in the compiled output and runs each as a real test.
 *
 * <p>The discovery floor below is the anti-regression guard: if a future change
 * stops the qualification classes being compiled, discovery collapses and this
 * fails loudly, instead of quietly returning to a green run of nothing.
 */
class QualificationBridgeTest {

    /** Discovery floor. 24 classes exist today; fewer than this means discovery broke. */
    private static final int MIN_EXPECTED_CLASSES = 25;

    /** Needs two CLI arguments by design, so it gets its own test below. */
    private static final String ARGS_REQUIRED = "org.systemmaster.core.Fwp001QualificationTest";

    private static Path repoRoot() {
        // Surefire runs with the project basedir as the working directory.
        Path root = Path.of(System.getProperty("basedir", System.getProperty("user.dir")));
        if (!Files.isRegularFile(root.resolve("pom.xml"))) {
            fail("cannot locate repository root: no pom.xml at " + root);
        }
        return root;
    }

    private static List<String> discoverQualificationClasses() {
        Path classesDir = repoRoot().resolve("target/classes");
        if (!Files.isDirectory(classesDir)) {
            fail("target/classes missing at " + classesDir
                    + " — run `mvn compile` first; the bridge tests the COMPILED classes.");
        }
        List<String> names = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(classesDir)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith("Test.class"))
                    .filter(p -> !p.getFileName().toString().contains("$"))
                    .forEach(p -> {
                        String rel = classesDir.relativize(p).toString()
                                .replace(java.io.File.separatorChar, '.');
                        names.add(rel.substring(0, rel.length() - ".class".length()));
                    });
        } catch (Exception e) {
            fail("failed walking " + classesDir + ": " + e);
        }
        names.sort(Comparator.naturalOrder());
        return names;
    }

    /**
     * Invokes a main(String[]) and turns any thrown exception into a test failure.
     * Output is captured so a passing run stays quiet and a failing one reports what
     * the class actually printed before it died.
     */
    private static void invokeMain(String className, String... args) throws Exception {
        Class<?> type = Class.forName(className);
        Method main;
        try {
            main = type.getMethod("main", String[].class);
        } catch (NoSuchMethodException e) {
            fail(className + " has no main(String[]) — discovery filter is wrong");
            return;
        }
        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        PrintStream sink = new PrintStream(captured, true, StandardCharsets.UTF_8);
        try {
            System.setOut(sink);
            System.setErr(sink);
            main.invoke(null, (Object) args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            System.setOut(originalOut);
            System.setErr(originalErr);
            fail(className + " FAILED: " + cause + "\n--- captured output ---\n"
                    + captured.toString(StandardCharsets.UTF_8), cause);
        } finally {
            System.setOut(originalOut);
            System.setErr(originalErr);
        }
    }

    @TestFactory
    @DisplayName("every compiled qualification class runs and passes")
    List<DynamicTest> qualificationClasses() {
        List<String> classNames = discoverQualificationClasses();

        if (classNames.size() < MIN_EXPECTED_CLASSES) {
            fail("discovered only " + classNames.size() + " qualification classes ("
                    + classNames + ") but expected at least " + MIN_EXPECTED_CLASSES
                    + ". Either compilation is broken or the discovery rule is stale — "
                    + "do NOT lower this floor to make the build pass.");
        }

        List<DynamicTest> tests = new ArrayList<>();
        for (String className : classNames) {
            if (ARGS_REQUIRED.equals(className)) {
                continue; // exercised by fwp001WithReconstructedFixture()
            }
            tests.add(DynamicTest.dynamicTest(className, () -> invokeMain(className)));
        }
        return tests;
    }

    @Test
    @DisplayName("F-WP-001 traceability qualification runs against its reconstructed fixture")
    void fwp001WithReconstructedFixture() throws Exception {
        Path root = repoRoot();
        Path packageRoot = root.resolve("system-master/f-wp-001");
        Path transport = packageRoot.resolve("transport/traceability");
        Path manifest = packageRoot.resolve("control/SOURCE-SLICE-MANIFEST.json");

        if (!Files.isDirectory(transport) || !Files.isRegularFile(manifest)) {
            fail("F-WP-001 fixture inputs missing: expected " + transport + " and " + manifest);
        }

        // The fixture is shipped as base64 parts and reassembled, exactly as
        // .github/scripts/fwp001-qualify.js does it.
        List<Path> parts;
        try (Stream<Path> list = Files.list(transport)) {
            parts = list.filter(p -> p.getFileName().toString().endsWith(".b64"))
                    .sorted(Comparator.comparing(p -> p.getFileName().toString()))
                    .toList();
        }
        if (parts.isEmpty()) {
            fail("no .b64 fixture parts found in " + transport);
        }

        StringBuilder base64 = new StringBuilder();
        for (Path part : parts) {
            base64.append(Files.readString(part, StandardCharsets.UTF_8).replaceAll("\\s+", ""));
        }
        byte[] fixtureBytes = Base64.getDecoder().decode(base64.toString());

        // Verify against the manifest's recorded digest, so a corrupted rebuild fails
        // here rather than surfacing as a confusing assertion inside the test class.
        Matcher m = Pattern.compile("\"reconstructed_traceability_fixture_sha256\"\\s*:\\s*\"([0-9a-fA-F]{64})\"")
                .matcher(Files.readString(manifest, StandardCharsets.UTF_8));
        if (!m.find()) {
            fail("manifest " + manifest + " has no reconstructed_traceability_fixture_sha256");
        }
        String expected = m.group(1).toLowerCase();
        String actual = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(fixtureBytes));
        if (!actual.equals(expected)) {
            fail("reconstructed fixture digest mismatch: expected " + expected + " got " + actual
                    + " (" + parts.size() + " parts, " + fixtureBytes.length + " bytes)");
        }

        Path csv = Files.createTempFile("021F-R1-ATOMIC-REQUIREMENTS-TRACEABILITY-", ".csv");
        try {
            Files.write(csv, fixtureBytes);
            invokeMain(ARGS_REQUIRED,
                    csv.toString(),
                    packageRoot.resolve("control/BASELINE-BINDING.json").toString());
        } finally {
            Files.deleteIfExists(csv);
        }
    }
}
