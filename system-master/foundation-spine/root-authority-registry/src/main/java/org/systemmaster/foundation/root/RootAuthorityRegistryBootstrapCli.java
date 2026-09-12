package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.stream.Collectors;

public final class RootAuthorityRegistryBootstrapCli {
    private RootAuthorityRegistryBootstrapCli() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 8) {
            throw new IllegalArgumentException(
                    "usage: <manifest> <snapshot> <commandId> <decisionRef> <actorRef> <reason> <occurredAt> <expectedProductId>");
        }
        Path manifestPath = Path.of(args[0]);
        Path snapshotPath = Path.of(args[1]);
        BootstrapManifest.Parsed parsed = BootstrapManifest.read(manifestPath);
        if (!parsed.definition().productRoot().productId().equals(args[7])) {
            throw new IllegalStateException("ROOT_REGISTRY_BOOTSTRAP_PRODUCT_MISMATCH");
        }
        MutationMetadata metadata = new MutationMetadata(args[2], args[3], args[4], args[5], Instant.parse(args[6]));
        AuthorityRegistry registry = AuthorityRegistry.initialize(
                new FileAuthorityRegistryStore(snapshotPath), parsed.definition(), metadata);
        RegistrySnapshot snapshot = registry.snapshot();
        verifyExpectedState(snapshot, parsed);
        System.out.println("ROOT_REGISTRY_BOOTSTRAP_PASS");
        System.out.println("revision=" + snapshot.revision());
        System.out.println("systems=" + snapshot.systems().size());
        System.out.println("authorities=" + snapshot.authorities().size());
        System.out.println("integration_edges=" + snapshot.integrationEdges().size());
        System.out.println("digest=" + registry.snapshotDigest());
    }

    private static void verifyExpectedState(RegistrySnapshot snapshot, BootstrapManifest.Parsed parsed) {
        Set<String> activePeers = snapshot.systems().values().stream()
                .filter(s -> s.lifecycle() == Lifecycle.ACTIVE)
                .filter(s -> s.parentId().equals(snapshot.productRoot().productId()))
                .map(SystemRecord::systemId)
                .collect(Collectors.toUnmodifiableSet());
        if (!activePeers.equals(parsed.expectedActivePeers())) {
            throw new IllegalStateException("ROOT_REGISTRY_ACTIVE_PEER_PARITY_FAILED:" + activePeers + ":" + parsed.expectedActivePeers());
        }
        Set<String> retired = snapshot.systems().values().stream()
                .filter(s -> s.lifecycle() == Lifecycle.RETIRED_TERMINAL)
                .map(SystemRecord::systemId)
                .collect(Collectors.toUnmodifiableSet());
        if (!retired.equals(parsed.expectedRetiredSystems())) {
            throw new IllegalStateException("ROOT_REGISTRY_RETIRED_PARITY_FAILED:" + retired + ":" + parsed.expectedRetiredSystems());
        }
        for (String id : parsed.expectedNotAdmitted()) {
            if (snapshot.systems().containsKey(id)) {
                throw new IllegalStateException("ROOT_REGISTRY_UNAUTHORIZED_ADMISSION:" + id);
            }
        }
    }
}
