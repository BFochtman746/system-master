package org.systemmaster.foundation.root;

import java.io.IOException;
import java.util.Objects;

import org.systemmaster.foundation.root.SystemAuthority.AdmissionBasis;
import org.systemmaster.foundation.root.SystemAuthority.Descriptor;
import org.systemmaster.foundation.root.SystemAuthority.VersionPointer;
import org.systemmaster.foundation.root.SystemRootStore.RootSnapshot;

/** Fail-closed dependency ports consumed by the System Root without absorbing their truth. */
public final class SystemRootGuards {
    private SystemRootGuards() {}

    public enum MutationAction {
        BOOTSTRAP,
        DECLARE_SYSTEM,
        REVISE_DESCRIPTOR,
        ADMIT_VERSION,
        BEGIN_DRAIN,
        RESUME_DRAIN,
        RETIRE_SYSTEM,
        REPLACE_AUTHORITY,
        PUT_TOPOLOGY_EDGE,
        REMOVE_TOPOLOGY_EDGE
    }

    public record MutationContext(
            MutationAction action,
            String targetSystemId,
            String actorRef,
            String decisionRef,
            String requestCanonical,
            String requestDigest,
            RootSnapshot current) {
        public MutationContext {
            Objects.requireNonNull(action, "action");
            targetSystemId = SystemAuthority.systemId(targetSystemId);
            actorRef = SystemAuthority.text(actorRef, "actorRef");
            decisionRef = SystemAuthority.text(decisionRef, "decisionRef");
            requestCanonical = Objects.requireNonNull(requestCanonical, "requestCanonical");
            if (requestCanonical.isBlank() || requestCanonical.length() > 1024 * 1024) {
                throw new IllegalArgumentException("requestCanonical invalid size");
            }
            requestDigest = SystemAuthority.sha256(requestDigest, "requestDigest");
            Objects.requireNonNull(current, "current");
        }
    }

    public record AdmissionRequest(
            String systemId,
            Descriptor descriptor,
            VersionPointer version,
            AdmissionBasis basis,
            String actorRef,
            String decisionRef,
            boolean bootstrap,
            RootSnapshot current) {
        public AdmissionRequest {
            systemId = SystemAuthority.systemId(systemId);
            Objects.requireNonNull(descriptor, "descriptor");
            if (!systemId.equals(descriptor.systemId())) throw new IllegalArgumentException("admission descriptor mismatch");
            Objects.requireNonNull(version, "version");
            Objects.requireNonNull(basis, "basis");
            actorRef = SystemAuthority.text(actorRef, "actorRef");
            decisionRef = SystemAuthority.text(decisionRef, "decisionRef");
            Objects.requireNonNull(current, "current");
        }
    }

    @FunctionalInterface
    public interface MutationAuthorizer {
        /** Return true only when the exact mutation is authorized now. Dependency errors should throw. */
        boolean authorized(MutationContext context) throws IOException;
    }

    @FunctionalInterface
    public interface AdmissionVerifier {
        /** Return true only when the exact version/basis may be admitted now. Dependency errors should throw. */
        boolean admissible(AdmissionRequest request) throws IOException;
    }

    public static MutationAuthorizer denyAllMutations() {
        return ignored -> false;
    }

    public static AdmissionVerifier denyAllAdmissions() {
        return ignored -> false;
    }
}
