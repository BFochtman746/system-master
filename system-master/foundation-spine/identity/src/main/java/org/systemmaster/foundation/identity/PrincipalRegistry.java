package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import java.io.IOException;
import java.util.List;
import java.util.Objects;

/** O-WP-001 PrincipalRegistry: stable canonical principal identity and history. */
public final class PrincipalRegistry {
    private final IdentityJournalStore store;
    private final IdentityMutationGate gate;

    public PrincipalRegistry(IdentityJournalStore store, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.gate = Objects.requireNonNull(gate, "gate");
    }

    public MutationResult registerPrincipal(RegisterPrincipalRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "RegisterPrincipal", request.principalId());
        return store.transact(new IdentityJournalStore.Register(request));
    }

    public MutationResult revisePrincipal(RevisePrincipalRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "RevisePrincipal", request.principalId());
        return store.transact(new IdentityJournalStore.Revise(request));
    }

    public Principal getPrincipal(String principalId) throws IOException {
        Principal principal = store.load().principals().get(requireId("principalId", principalId));
        if (principal == null) throw new IdentityException(ErrorCode.NOT_FOUND, "principal not found");
        return principal;
    }

    public List<PrincipalRevision> getPrincipalHistory(String principalId) throws IOException {
        List<PrincipalRevision> history = store.load().histories().get(requireId("principalId", principalId));
        if (history == null) throw new IdentityException(ErrorCode.NOT_FOUND, "principal not found");
        return history;
    }
}
