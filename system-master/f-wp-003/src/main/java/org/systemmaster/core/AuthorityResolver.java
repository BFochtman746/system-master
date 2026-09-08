package org.systemmaster.core;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Resolves the semantic owner named by the immutable change revision; executor/provider identity is never ownership. */
public final class AuthorityResolver {
    public record Resolution(String semanticOwnerRef, boolean resolved, List<String> reasons) {
        public Resolution { reasons = List.copyOf(reasons); }
    }

    public Resolution resolve(ChangeRegistry.ChangeRevision revision, Collection<String> currentSemanticOwners) {
        Objects.requireNonNull(revision, "revision");
        Objects.requireNonNull(currentSemanticOwners, "currentSemanticOwners");
        String owner = revision.semanticOwnerRef();
        if (owner == null || owner.isBlank()) {
            return new Resolution(owner, false, List.of("MISSING_SEMANTIC_OWNER"));
        }
        Set<String> owners = new LinkedHashSet<>();
        for (String value : currentSemanticOwners) {
            if (value != null && !value.isBlank()) owners.add(value);
        }
        ArrayList<String> reasons = new ArrayList<>();
        if (!owners.contains(owner)) reasons.add("UNRESOLVED_SEMANTIC_OWNER:" + owner);
        return new Resolution(owner, reasons.isEmpty(), reasons);
    }
}
