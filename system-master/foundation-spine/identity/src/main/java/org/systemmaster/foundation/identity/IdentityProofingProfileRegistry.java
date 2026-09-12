package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.io.IOException;
import java.util.Objects;

/** O-WP-002 registry for immutable versioned proofing/enrollment policy profiles. */
public final class IdentityProofingProfileRegistry {
    private final ProofingJournalStore store;
    private final IdentityMutationGate gate;

    public IdentityProofingProfileRegistry(ProofingJournalStore store, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.gate = Objects.requireNonNull(gate, "gate");
    }

    public ProfileMutationResult publishIdentityProofingProfile(PublishIdentityProofingProfileRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "PublishIdentityProofingProfile", request.profile().profileId());
        return store.publish(request);
    }

    public IdentityProofingProfile getProfile(ProfileRef ref) throws IOException {
        return store.getProfile(Objects.requireNonNull(ref, "ref"));
    }

    public IdentityProofingProfile getLatestProfile(String profileId) throws IOException {
        return store.getLatestProfile(profileId);
    }
}
