package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import java.io.IOException;
import java.util.Objects;

/** O-WP-001 principal standing transitions; retirement is terminal and merges require adjudication. */
public final class PrincipalLifecycleService {
    private final IdentityJournalStore store;
    private final IdentityMutationGate gate;

    public PrincipalLifecycleService(IdentityJournalStore store, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.gate = Objects.requireNonNull(gate, "gate");
    }

    public MutationResult changePrincipalStanding(ChangePrincipalStandingRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "ChangePrincipalStanding", request.principalId());
        return store.transact(new IdentityJournalStore.Standing(request));
    }
}
