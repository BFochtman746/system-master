package org.systemmaster.tools.document.spine;

/** Ordered universal document execution stages. */
public enum DocumentSpineStage {
    INTAKE(10, true),
    IDENTIFY(20, false),
    SECURE(30, false),
    FORENSICS(40, false),
    PARSE(50, false),
    EXTRACT(60, false),
    UNDERSTAND(70, false),
    PLAN(80, false),
    REBUILD(90, true),
    MASTER(100, true),
    CREATE(110, true),
    RENDER(120, true),
    COMPARE(130, false),
    VALIDATE(140, false),
    ACCESSIBILITY(150, false),
    SECURITY_PROOF(160, false),
    PROVE(170, false),
    VERSION(180, true),
    PUBLISH(190, true);

    private final int order;
    private final boolean effectful;

    DocumentSpineStage(int order, boolean effectful) {
        this.order = order;
        this.effectful = effectful;
    }

    public int order() {
        return order;
    }

    public boolean effectful() {
        return effectful;
    }
}
