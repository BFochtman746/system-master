package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.SystemAuthority.*;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;

/** Separate-process writer used to qualify OS-level root-store locking/CAS. */
public final class SystemRootExternalWriter {
    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <store> <systemId> <truthKey> <operationId> <instant>");
        SystemRootRegistry registry = new SystemRootRegistry(
                new FileSystemRootStore(Path.of(args[0])), ignored -> true, ignored -> true,
                Clock.fixed(Instant.parse(args[4]), ZoneOffset.UTC));
        Descriptor descriptor = new Descriptor(args[1], args[1], "External writer " + args[1],
                AuthorityKind.FOUNDATION_SHARED, Set.of(args[2]), Set.of("Does not own unrelated state"));
        registry.declare(descriptor, "principal:external-writer", "decision:external-writer", args[3]);
        System.out.println("PASS " + args[1]);
    }
}
