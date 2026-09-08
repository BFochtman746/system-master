package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** First-class F-WP-004 maintenance-window conditions. */
public final class MaintenanceWindowService {
    public enum Standing { OPEN, WAIT_OUTSIDE_WINDOW, NOT_APPLICABLE, OVERRIDE_ACCEPTED, OVERRIDE_REJECTED }

    public record MaintenanceWindow(
            String windowId,
            long version,
            ZoneId timezone,
            Instant startsAt,
            Instant endsAt,
            Set<String> applicableTargetIdentities,
            Set<String> permittedActionClasses,
            String overrideAuthorityRef,
            String digest) {
        public MaintenanceWindow {
            requireText(windowId, "windowId");
            if (version < 1) throw new IllegalArgumentException("INVALID_WINDOW_VERSION");
            timezone = Objects.requireNonNull(timezone, "timezone");
            startsAt = Objects.requireNonNull(startsAt, "startsAt");
            endsAt = Objects.requireNonNull(endsAt, "endsAt");
            if (!startsAt.isBefore(endsAt)) throw new IllegalArgumentException("INVALID_WINDOW_RANGE");
            applicableTargetIdentities = Set.copyOf(Objects.requireNonNull(applicableTargetIdentities, "applicableTargetIdentities"));
            permittedActionClasses = Set.copyOf(Objects.requireNonNull(permittedActionClasses, "permittedActionClasses"));
            if (applicableTargetIdentities.isEmpty()) throw new IllegalArgumentException("WINDOW_TARGETS_REQUIRED");
            if (permittedActionClasses.isEmpty()) throw new IllegalArgumentException("WINDOW_ACTIONS_REQUIRED");
            requireText(overrideAuthorityRef, "overrideAuthorityRef");
            String computed = digestWindow(windowId, version, timezone, startsAt, endsAt,
                    applicableTargetIdentities, permittedActionClasses, overrideAuthorityRef);
            if (digest == null || digest.isBlank()) digest = computed;
            if (!digest.equals(computed)) throw new IllegalArgumentException("WINDOW_DIGEST_MISMATCH");
        }
    }

    public record Evaluation(Standing standing, String windowId, long windowVersion, String windowDigest, List<String> reasons) {
        public Evaluation { reasons = List.copyOf(reasons); }
    }

    public Evaluation evaluate(MaintenanceWindow window, String actionClass, Set<String> changeTargets,
            Instant now, String presentedOverrideAuthorityRef) {
        Objects.requireNonNull(window, "window");
        requireText(actionClass, "actionClass");
        Objects.requireNonNull(changeTargets, "changeTargets");
        Objects.requireNonNull(now, "now");
        boolean applies = window.applicableTargetIdentities().stream().anyMatch(changeTargets::contains);
        if (!applies || !window.permittedActionClasses().contains(actionClass)) {
            return new Evaluation(Standing.NOT_APPLICABLE, window.windowId(), window.version(), window.digest(), List.of());
        }
        boolean inside = !now.isBefore(window.startsAt()) && now.isBefore(window.endsAt());
        if (inside) return new Evaluation(Standing.OPEN, window.windowId(), window.version(), window.digest(), List.of());
        if (presentedOverrideAuthorityRef == null || presentedOverrideAuthorityRef.isBlank()) {
            return new Evaluation(Standing.WAIT_OUTSIDE_WINDOW, window.windowId(), window.version(), window.digest(),
                    List.of("OUTSIDE_MAINTENANCE_WINDOW"));
        }
        if (window.overrideAuthorityRef().equals(presentedOverrideAuthorityRef)) {
            return new Evaluation(Standing.OVERRIDE_ACCEPTED, window.windowId(), window.version(), window.digest(),
                    List.of("EXPLICIT_OVERRIDE_AUTHORITY"));
        }
        return new Evaluation(Standing.OVERRIDE_REJECTED, window.windowId(), window.version(), window.digest(),
                List.of("INVALID_OVERRIDE_AUTHORITY"));
    }

    private static String digestWindow(String id, long version, ZoneId zone, Instant start, Instant end,
            Set<String> targets, Set<String> actions, String override) {
        return sha256("FWP004-WINDOW-V1|id=" + id + "|version=" + version + "|zone=" + zone
                + "|start=" + start + "|end=" + end + "|targets=" + String.join(",", new TreeSet<>(targets))
                + "|actions=" + String.join(",", new TreeSet<>(actions)) + "|override=" + override);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }
}
