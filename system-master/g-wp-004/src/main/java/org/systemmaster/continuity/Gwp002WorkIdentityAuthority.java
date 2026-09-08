package org.systemmaster.continuity;

import java.util.Objects;
import java.util.function.Predicate;

public final class Gwp002WorkIdentityAuthority implements CheckpointAuthorities.WorkIdentityAuthority {
    private final Predicate<String> exists;
    public Gwp002WorkIdentityAuthority(Predicate<String> exists){this.exists=Objects.requireNonNull(exists,"exists");}
    @Override public boolean exists(String workUnitId){return exists.test(workUnitId);}
}
