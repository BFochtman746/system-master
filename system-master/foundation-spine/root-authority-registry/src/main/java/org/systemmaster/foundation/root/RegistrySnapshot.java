package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

public final class RegistrySnapshot {
    public static final int MAX_HIERARCHY_DEPTH = 64;
    public static final int MAX_SYSTEMS = 10_000;
    public static final int MAX_AUTHORITIES = 50_000;
    public static final int MAX_INTEGRATION_EDGES = 100_000;
    public static final int MAX_RECENT_COMMAND_EVENTS = 4_096;
    private final long revision;
    private final ProductRoot productRoot;
    private final Map<String, SystemRecord> systems;
    private final Map<String, AuthorityRecord> authorities;
    private final Map<String, IntegrationEdge> integrationEdges;
    private final List<ChangeEvent> events;

    public RegistrySnapshot(
            long revision,
            ProductRoot productRoot,
            Map<String, SystemRecord> systems,
            Map<String, AuthorityRecord> authorities,
            Map<String, IntegrationEdge> integrationEdges,
            List<ChangeEvent> events) {
        if (revision < 1) throw new IllegalArgumentException("revision must be positive");
        this.revision = revision;
        this.productRoot = Objects.requireNonNull(productRoot, "productRoot");
        this.systems = Map.copyOf(new TreeMap<>(Objects.requireNonNull(systems, "systems")));
        this.authorities = Map.copyOf(new TreeMap<>(Objects.requireNonNull(authorities, "authorities")));
        this.integrationEdges = Map.copyOf(new TreeMap<>(Objects.requireNonNull(integrationEdges, "integrationEdges")));
        this.events = List.copyOf(Objects.requireNonNull(events, "events"));
        validate();
    }

    public long revision() { return revision; }
    public ProductRoot productRoot() { return productRoot; }
    public Map<String, SystemRecord> systems() { return systems; }
    public Map<String, AuthorityRecord> authorities() { return authorities; }
    public Map<String, IntegrationEdge> integrationEdges() { return integrationEdges; }
    public List<ChangeEvent> events() { return events; }

    public Optional<SystemRecord> system(String systemId) {
        return Optional.ofNullable(systems.get(systemId));
    }

    public Optional<AuthorityRecord> authority(String authorityId) {
        return Optional.ofNullable(authorities.get(authorityId));
    }

    public Optional<IntegrationEdge> integrationEdge(String edgeId) {
        return Optional.ofNullable(integrationEdges.get(edgeId));
    }

    public List<SystemRecord> activeSystems() {
        return systems.values().stream().filter(s -> s.lifecycle() == Lifecycle.ACTIVE).toList();
    }

    public List<SystemRecord> retiredSystems() {
        return systems.values().stream().filter(s -> s.lifecycle() == Lifecycle.RETIRED_TERMINAL).toList();
    }

    public List<SystemRecord> childrenOf(String parentId) {
        return systems.values().stream().filter(s -> s.parentId().equals(parentId)).toList();
    }

    public Map<String, String> ownerMap() {
        Map<String, String> result = new TreeMap<>();
        for (SystemRecord system : systems.values()) result.put(system.systemId(), system.ownerPath());
        return Map.copyOf(result);
    }

    public List<IntegrationEdge> activeIntegrationEdges() {
        return integrationEdges.values().stream().filter(e -> e.lifecycle() == Lifecycle.ACTIVE).toList();
    }

    public Optional<ChangeEvent> eventForCommand(String commandId) {
        return events.stream().filter(e -> e.commandId().equals(commandId)).findFirst();
    }

    public void validate() {
        if (productRoot.productId().contains("/")) {
            throw new IllegalStateException("PRODUCT_ROOT_ID_MUST_NOT_CONTAIN_SLASH");
        }
        if (systems.size() > MAX_SYSTEMS) throw new IllegalStateException("SYSTEM_LIMIT_EXCEEDED:" + systems.size());
        if (authorities.size() > MAX_AUTHORITIES) throw new IllegalStateException("AUTHORITY_LIMIT_EXCEEDED:" + authorities.size());
        if (integrationEdges.size() > MAX_INTEGRATION_EDGES) throw new IllegalStateException("INTEGRATION_EDGE_LIMIT_EXCEEDED:" + integrationEdges.size());
        if (events.isEmpty()) throw new IllegalStateException("RECENT_COMMAND_JOURNAL_EMPTY");
        if (events.size() > MAX_RECENT_COMMAND_EVENTS) throw new IllegalStateException("RECENT_COMMAND_JOURNAL_LIMIT_EXCEEDED:" + events.size());
        long lastRevision = 0;
        Set<String> commandIds = new HashSet<>();
        for (ChangeEvent event : events) {
            if (event.revision() <= lastRevision) throw new IllegalStateException("EVENT_REVISIONS_NOT_STRICTLY_INCREASING");
            if (!commandIds.add(event.commandId())) throw new IllegalStateException("DUPLICATE_COMMAND_ID:" + event.commandId());
            lastRevision = event.revision();
        }
        if (lastRevision != revision) throw new IllegalStateException("EVENT_HEAD_REVISION_MISMATCH");

        Set<String> ownerPaths = new HashSet<>();
        for (SystemRecord system : systems.values()) {
            if (!system.systemId().equals(systems.get(system.systemId()).systemId())) {
                throw new IllegalStateException("SYSTEM_MAP_KEY_MISMATCH:" + system.systemId());
            }
            if (system.systemId().equals(productRoot.productId())) {
                throw new IllegalStateException("SYSTEM_ID_COLLIDES_WITH_PRODUCT_ROOT:" + system.systemId());
            }
            if (!ownerPaths.add(system.ownerPath())) {
                throw new IllegalStateException("DUPLICATE_OWNER_PATH:" + system.ownerPath());
            }
            String expectedPath = expectedOwnerPath(system);
            if (!system.ownerPath().equals(expectedPath)) {
                throw new IllegalStateException("OWNER_PATH_MISMATCH:" + system.systemId() + ":" + system.ownerPath() + ":" + expectedPath);
            }
            if (system.lifecycle() == Lifecycle.ACTIVE && !parentIsActiveOrRoot(system.parentId())) {
                throw new IllegalStateException("ACTIVE_SYSTEM_HAS_INACTIVE_OR_UNKNOWN_PARENT:" + system.systemId());
            }
        }
        validateNoCycles();

        for (AuthorityRecord authority : authorities.values()) {
            SystemRecord owner = systems.get(authority.ownerSystemId());
            if (owner == null) throw new IllegalStateException("AUTHORITY_OWNER_UNKNOWN:" + authority.authorityId());
            if (authority.lifecycle() == Lifecycle.ACTIVE && owner.lifecycle() != Lifecycle.ACTIVE) {
                throw new IllegalStateException("ACTIVE_AUTHORITY_OWNED_BY_RETIRED_SYSTEM:" + authority.authorityId());
            }
        }

        for (IntegrationEdge edge : integrationEdges.values()) {
            SystemRecord producer = systems.get(edge.producerSystemId());
            SystemRecord consumer = systems.get(edge.consumerSystemId());
            if (producer == null || consumer == null) {
                throw new IllegalStateException("INTEGRATION_ENDPOINT_UNKNOWN:" + edge.edgeId());
            }
            if (edge.lifecycle() == Lifecycle.ACTIVE &&
                    (producer.lifecycle() != Lifecycle.ACTIVE || consumer.lifecycle() != Lifecycle.ACTIVE)) {
                throw new IllegalStateException("ACTIVE_INTEGRATION_EDGE_HAS_RETIRED_ENDPOINT:" + edge.edgeId());
            }
        }

        for (SystemRecord system : systems.values()) {
            if (system.lifecycle() == Lifecycle.RETIRED_TERMINAL) {
                boolean activeChild = systems.values().stream().anyMatch(s ->
                        s.lifecycle() == Lifecycle.ACTIVE && s.parentId().equals(system.systemId()));
                if (activeChild) throw new IllegalStateException("RETIRED_SYSTEM_HAS_ACTIVE_CHILD:" + system.systemId());
                boolean activeAuthority = authorities.values().stream().anyMatch(a ->
                        a.lifecycle() == Lifecycle.ACTIVE && a.ownerSystemId().equals(system.systemId()));
                if (activeAuthority) throw new IllegalStateException("RETIRED_SYSTEM_HAS_ACTIVE_AUTHORITY:" + system.systemId());
                boolean activeEdge = integrationEdges.values().stream().anyMatch(e ->
                        e.lifecycle() == Lifecycle.ACTIVE &&
                                (e.producerSystemId().equals(system.systemId()) || e.consumerSystemId().equals(system.systemId())));
                if (activeEdge) throw new IllegalStateException("RETIRED_SYSTEM_HAS_ACTIVE_INTEGRATION_EDGE:" + system.systemId());
            }
        }
    }

    private String expectedOwnerPath(SystemRecord system) {
        if (system.parentId().equals(productRoot.productId())) {
            return productRoot.productId() + "/" + system.systemId();
        }
        SystemRecord parent = systems.get(system.parentId());
        if (parent == null) throw new IllegalStateException("UNKNOWN_PARENT:" + system.systemId() + ":" + system.parentId());
        return parent.ownerPath() + "/" + system.systemId();
    }

    private boolean parentIsActiveOrRoot(String parentId) {
        if (parentId.equals(productRoot.productId())) return true;
        SystemRecord parent = systems.get(parentId);
        return parent != null && parent.lifecycle() == Lifecycle.ACTIVE;
    }

    private void validateNoCycles() {
        Map<String, Integer> color = new HashMap<>();
        for (String id : systems.keySet()) {
            if (color.getOrDefault(id, 0) == 0) visit(id, color, 1);
        }
    }

    private void visit(String id, Map<String, Integer> color, int depth) {
        if (depth > MAX_HIERARCHY_DEPTH) throw new IllegalStateException("TOPOLOGY_DEPTH_LIMIT_EXCEEDED:" + id);
        color.put(id, 1);
        SystemRecord current = systems.get(id);
        String parent = current.parentId();
        if (!parent.equals(productRoot.productId())) {
            if (!systems.containsKey(parent)) throw new IllegalStateException("UNKNOWN_PARENT:" + id + ":" + parent);
            int c = color.getOrDefault(parent, 0);
            if (c == 1) throw new IllegalStateException("TOPOLOGY_CYCLE:" + id + ":" + parent);
            if (c == 0) visit(parent, color, depth + 1);
        }
        color.put(id, 2);
    }

    public RegistrySnapshot with(
            long newRevision,
            ProductRoot newRoot,
            Map<String, SystemRecord> newSystems,
            Map<String, AuthorityRecord> newAuthorities,
            Map<String, IntegrationEdge> newEdges,
            ChangeEvent event) {
        List<ChangeEvent> nextEvents = new ArrayList<>(events);
        nextEvents.add(event);
        if (nextEvents.size() > MAX_RECENT_COMMAND_EVENTS) {
            nextEvents = new ArrayList<>(nextEvents.subList(nextEvents.size() - MAX_RECENT_COMMAND_EVENTS, nextEvents.size()));
        }
        return new RegistrySnapshot(newRevision, newRoot, newSystems, newAuthorities, newEdges, nextEvents);
    }

    public static RegistrySnapshot bootstrap(
            BootstrapDefinition definition,
            ChangeEvent bootstrapEvent) {
        Objects.requireNonNull(definition, "definition");
        Objects.requireNonNull(bootstrapEvent, "bootstrapEvent");
        if (bootstrapEvent.revision() != 1 || bootstrapEvent.operation() != Operation.BOOTSTRAP) {
            throw new IllegalArgumentException("bootstrap event must be revision 1 BOOTSTRAP");
        }
        if (definition.systems().size() > MAX_SYSTEMS) throw new IllegalStateException("SYSTEM_LIMIT_EXCEEDED:" + definition.systems().size());
        if (definition.authorities().size() > MAX_AUTHORITIES) throw new IllegalStateException("AUTHORITY_LIMIT_EXCEEDED:" + definition.authorities().size());
        if (definition.integrationEdges().size() > MAX_INTEGRATION_EDGES) throw new IllegalStateException("INTEGRATION_EDGE_LIMIT_EXCEEDED:" + definition.integrationEdges().size());
        Map<String, SystemRecord> systems = new LinkedHashMap<>();
        Map<String, Integer> depths = new HashMap<>();
        List<BootstrapSystem> remaining = new ArrayList<>(definition.systems());
        boolean changed;
        do {
            changed = false;
            var iterator = remaining.iterator();
            while (iterator.hasNext()) {
                BootstrapSystem input = iterator.next();
                if (systems.containsKey(input.systemId())) throw new IllegalStateException("DUPLICATE_SYSTEM_ID:" + input.systemId());
                String ownerPath;
                int depth;
                if (input.parentId().equals(definition.productRoot().productId())) {
                    depth = 1;
                    ownerPath = definition.productRoot().productId() + "/" + input.systemId();
                } else {
                    SystemRecord parent = systems.get(input.parentId());
                    if (parent == null) continue;
                    depth = depths.get(input.parentId()) + 1;
                    if (depth > MAX_HIERARCHY_DEPTH) throw new IllegalStateException("TOPOLOGY_DEPTH_LIMIT_EXCEEDED:" + input.systemId());
                    ownerPath = parent.ownerPath() + "/" + input.systemId();
                }
                depths.put(input.systemId(), depth);
                systems.put(input.systemId(), new SystemRecord(input.systemId(), input.canonicalName(), input.classification(),
                        input.parentId(), ownerPath, input.versionPointer(), input.controlRef(), input.lifecycle(), 1,
                        input.lifecycle() == Lifecycle.RETIRED_TERMINAL ? 1L : null));
                iterator.remove();
                changed = true;
            }
        } while (changed && !remaining.isEmpty());
        if (!remaining.isEmpty()) {
            throw new IllegalStateException("BOOTSTRAP_HAS_UNKNOWN_OR_CYCLIC_PARENTS:" + remaining.stream().map(BootstrapSystem::systemId).toList());
        }

        Map<String, AuthorityRecord> authorities = new LinkedHashMap<>();
        for (BootstrapAuthority input : definition.authorities()) {
            if (authorities.putIfAbsent(input.authorityId(), new AuthorityRecord(input.authorityId(), input.canonicalName(),
                    input.ownerSystemId(), input.versionPointer(), input.lifecycle(), 1,
                    input.lifecycle() == Lifecycle.RETIRED_TERMINAL ? 1L : null)) != null) {
                throw new IllegalStateException("DUPLICATE_AUTHORITY_ID:" + input.authorityId());
            }
        }

        Map<String, IntegrationEdge> edges = new LinkedHashMap<>();
        for (BootstrapEdge input : definition.integrationEdges()) {
            if (edges.putIfAbsent(input.edgeId(), new IntegrationEdge(input.edgeId(), input.producerSystemId(),
                    input.consumerSystemId(), input.interfaceRef(), input.lifecycle(), 1,
                    input.lifecycle() == Lifecycle.RETIRED_TERMINAL ? 1L : null)) != null) {
                throw new IllegalStateException("DUPLICATE_INTEGRATION_EDGE_ID:" + input.edgeId());
            }
        }
        return new RegistrySnapshot(1, definition.productRoot(), systems, authorities, edges, List.of(bootstrapEvent));
    }
}
