package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Proves the correlation contract between {@code .github/workflows/claim-work.yml} and
 * {@link ActionsRunPoller#titleCorrelates(String, String)}.
 *
 * <p>WHY THIS TEST EXISTS. The poller cannot address the run it starts — {@code
 * workflow_dispatch} answers {@code 204} with no run id — so it finds the run by matching the
 * claim id in the run title. That makes the workflow's {@code run-name} a load-bearing part of
 * the runtime contract, enforced by nothing but a YAML string in a different file and a
 * different language. Before this test, {@code claim-work.yml} set no {@code run-name} at all
 * (no workflow in the repository did), so every run was titled "Claim Work" and a
 * poller-wrapped consumer would have refused EVERY claim with
 * {@code DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW}.
 *
 * <p>WHAT IT ACTUALLY CHECKS. It reads the real workflow file off disk and renders the real
 * template through the real matcher. It does not restate the expected title as a literal —
 * that would pass while the workflow said something else entirely, which is the exact class of
 * false assurance this repository has been unwinding. The decisive case is the boundary one:
 * the title rendered for claim {@code job-11} must NOT satisfy claim {@code job-1}. A
 * separator that is itself an identifier character (a hyphen, say) fails that and is caught
 * here rather than in production, where it would terminalize one claim on another's outcome.
 */
public final class ClaimWorkCorrelationTest {

    private static final Pattern PLACEHOLDER =
            Pattern.compile("\\$\\{\\{\\s*inputs\\.claim_id\\s*\\}\\}");

    private static int checks;
    private static int failures;

    public static void main(String[] args) {
        Path workflow = repoRoot().resolve(".github/workflows/claim-work.yml");
        String yaml = read(workflow);

        String template = runNameTemplate(yaml);
        dispatchInputStillDeclared(yaml);

        if (template != null) {
            correlationHolds(template);
            boundaryRejectsNeighbouringClaims(template);
            delimitersAreNonIdentifier(template);
        }

        System.out.println("CLAIM-WORK-CORRELATION-1.0  checks=" + checks + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            throw new IllegalStateException("CLAIM_WORK_CORRELATION_FAILURES=" + failures);
        }
        System.out.println("RESULT: PASS");
    }

    /** The run-name must exist and must actually interpolate the claim id. */
    private static String runNameTemplate(String yaml) {
        String found = null;
        for (String line : yaml.split("\n", -1)) {
            if (line.startsWith("run-name:")) {
                found = line.substring("run-name:".length()).trim();
                break;
            }
        }
        if (found == null || found.isEmpty()) {
            fail("claim-work.yml declares a top-level run-name",
                    "absent — every run would be titled by `name:` and carry no claim id, so "
                            + "the poller could never correlate a run to its claim");
            return null;
        }
        pass("claim-work.yml declares a top-level run-name");

        if (!PLACEHOLDER.matcher(found).find()) {
            fail("run-name interpolates the claim id",
                    "no ${{ inputs.claim_id }} in: " + found);
            return null;
        }
        pass("run-name interpolates the claim id");
        return found;
    }

    /** Correlation reads a value the dispatch contract must still supply. */
    private static void dispatchInputStillDeclared(String yaml) {
        if (yaml.contains("claim_id:")) {
            pass("workflow still declares the claim_id dispatch input");
        } else {
            fail("workflow still declares the claim_id dispatch input",
                    "claim_id input missing — run-name would interpolate nothing");
        }
    }

    /** A rendered title must satisfy its own claim, for ordinary and awkward ids alike. */
    private static void correlationHolds(String template) {
        for (String claimId : new String[] {
                "job-1", "job-11", "claim-2026-09-17-a", "a", "with_underscore", "UPPER-1" }) {
            String title = render(template, claimId);
            if (ActionsRunPoller.titleCorrelates(title, claimId)) {
                pass("rendered title correlates to its own claim " + claimId + " -> " + title);
            } else {
                fail("rendered title correlates to its own claim " + claimId,
                        "titleCorrelates(\"" + title + "\", \"" + claimId + "\") was false");
            }
        }
    }

    /**
     * The case that matters. {@code "…[job-11]".contains("job-1")} is true, so a title rendered
     * for one claim must not be allowed to satisfy a shorter neighbour.
     */
    private static void boundaryRejectsNeighbouringClaims(String template) {
        String[][] pairs = {
                { "job-11", "job-1" },
                { "job-1x", "job-1" },
                { "xjob-1", "job-1" },
                { "claim-2026-09-17-ab", "claim-2026-09-17-a" },
        };
        for (String[] pair : pairs) {
            String title = render(template, pair[0]);
            if (ActionsRunPoller.titleCorrelates(title, pair[1])) {
                fail("run for " + pair[0] + " must not satisfy claim " + pair[1],
                        "title \"" + title + "\" wrongly correlated to \"" + pair[1]
                                + "\" — this claim would terminalize on another run's outcome");
            } else {
                pass("run for " + pair[0] + " does not satisfy claim " + pair[1]);
            }
        }
    }

    /**
     * Structural reason the above holds: the characters flanking the interpolated id are
     * non-identifier. Checked directly so a future reformat is told <em>why</em> it broke.
     */
    private static void delimitersAreNonIdentifier(String template) {
        Matcher m = PLACEHOLDER.matcher(template);
        if (!m.find()) return;
        boolean leftOk = m.start() == 0 || !isIdentifierChar(template.charAt(m.start() - 1));
        boolean rightOk = m.end() == template.length() || !isIdentifierChar(template.charAt(m.end()));
        if (leftOk && rightOk) {
            pass("claim id is delimited by non-identifier characters in run-name");
        } else {
            fail("claim id is delimited by non-identifier characters in run-name",
                    "template \"" + template + "\" flanks the id with an identifier character"
                            + " ('-' and '_' count as identifier), which defeats whole-token"
                            + " matching");
        }
    }

    private static boolean isIdentifierChar(char c) {
        return Character.isLetterOrDigit(c) || c == '-' || c == '_';
    }

    private static String render(String template, String claimId) {
        return PLACEHOLDER.matcher(template).replaceAll(Matcher.quoteReplacement(claimId));
    }

    private static Path repoRoot() {
        Path at = Path.of(System.getProperty("basedir", System.getProperty("user.dir")))
                .toAbsolutePath();
        for (Path p = at; p != null; p = p.getParent()) {
            if (Files.isRegularFile(p.resolve("pom.xml"))
                    && Files.isRegularFile(p.resolve(".github/workflows/claim-work.yml"))) {
                return p;
            }
        }
        throw new IllegalStateException("CANNOT_LOCATE_REPO_ROOT from " + at);
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("CANNOT_READ:" + path, e);
        }
    }

    private static void pass(String what) {
        checks++;
        System.out.println("PASS  " + what);
    }

    private static void fail(String what, String detail) {
        checks++;
        failures++;
        System.out.println("FAIL  " + what + " — " + detail);
    }

    private ClaimWorkCorrelationTest() { }
}
