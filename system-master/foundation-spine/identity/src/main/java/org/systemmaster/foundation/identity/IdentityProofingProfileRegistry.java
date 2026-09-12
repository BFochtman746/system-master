package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.EnrollmentContracts.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.IOException;
import java.util.Objects;

/** O-WP-002 versioned proofing/enrollment profile authority. */
public final class IdentityProofingProfileRegistry {
    private final EnrollmentJournalStore store;
    private final IdentityMutationGate gate;

    public IdentityProofingProfileRegistry(EnrollmentJournalStore store, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.gate = Objects.requireNonNull(gate, "gate");
    }

    public ProfileMutationResult publishIdentityProofingProfile(PublishIdentityProofingProfileRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "PublishIdentityProofingProfile", request.profileId());
        return store.publish(new EnrollmentJournalStore.Publish(request));
    }

    public IdentityProofingProfile getProfile(String profileId, long version) throws IOException {
        if (version < 1) throw new IllegalArgumentException("profile version must be >= 1");
        String ref = requireId("profileId", profileId) + "@" + version;
        IdentityProofingProfile profile = store.load().profiles().get(ref);
        if (profile == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
        return profile;
    }

    public IdentityProofingProfile getCurrentProfile(String profileId) throws IOException {
        String id = requireId("profileId", profileId);
        EnrollmentJournalStore.Snapshot snapshot = store.load();
        Long version = snapshot.latestProfileVersion().get(id);
        if (version == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
        IdentityProofingProfile profile = snapshot.profiles().get(id + "@" + version);
        if (profile == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "current profile pointer is invalid");
        return profile;
    }
}
