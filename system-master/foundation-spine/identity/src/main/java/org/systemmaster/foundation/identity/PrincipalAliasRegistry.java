package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import java.io.IOException;
import java.time.Instant;
import java.util.Objects;

/** O-WP-001 alias registry. Aliases are lookup handles, never identity truth. */
public final class PrincipalAliasRegistry {
    private final IdentityJournalStore store;
    private final IdentityMutationGate gate;

    public PrincipalAliasRegistry(IdentityJournalStore store, IdentityMutationGate gate) {
        this.store = Objects.requireNonNull(store, "store");
        this.gate = Objects.requireNonNull(gate, "gate");
    }

    public MutationResult registerPrincipalAlias(RegisterPrincipalAliasRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        gate.authorize(request.context(), "RegisterPrincipalAlias", request.principalId());
        return store.transact(new IdentityJournalStore.Alias(request));
    }

    public Principal resolvePrincipalAlias(String aliasType, String valueDigestOrRef, String issuerOrNamespace, Instant now) throws IOException {
        Objects.requireNonNull(now, "now");
        PrincipalAlias probe = new PrincipalAlias("probe", "probe", aliasType, valueDigestOrRef, issuerOrNamespace, Instant.EPOCH, null, AliasStanding.ACTIVE);
        IdentityJournalStore.Snapshot snapshot = store.load();
        PrincipalAlias matched = null;
        for (PrincipalAlias alias : snapshot.aliases().values()) {
            if (alias.collisionKey().equals(probe.collisionKey()) && alias.currentAt(now)) {
                if (matched != null && !matched.principalId().equals(alias.principalId())) {
                    throw new IdentityException(ErrorCode.AMBIGUOUS, "multiple active principals match alias");
                }
                matched = alias;
            }
        }
        if (matched == null) throw new IdentityException(ErrorCode.NOT_FOUND, "alias not found or not current");
        Principal principal = snapshot.principals().get(matched.principalId());
        if (principal == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "alias references missing principal");
        if (principal.status() == PrincipalStatus.RETIRED || principal.status() == PrincipalStatus.DISABLED || principal.status() == PrincipalStatus.QUARANTINED) {
            throw new IdentityException(ErrorCode.REVOKED, "principal standing blocks alias use");
        }
        return principal;
    }
}
