package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/**
 * Current-authority LEARNING-owned inbound bindings for I001-I004.
 *
 * <p>The handlers are intentionally thin. They enforce the frozen route boundary
 * and delegate one typed semantic command to LearningGoalController. CORE owns
 * shared routing/dispatch and generic physical persistence mechanics; this class
 * neither recreates those mechanics nor selects a transport encoding.
 */
public final class LearningGoalInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String CAPABILITY_BINDING = "C18 LEARNING";
    public static final String PORT = "LRN-CMD-PORT-001";
    public static final String TARGET_COMPONENT = "LearningGoalController";

    public static final RouteDescriptor I001 = new RouteDescriptor(
            "I001",
            InterfaceType.COMMAND,
            "CreateLearningGoal",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            TARGET_COMPONENT,
            "MASTER_CORE_ROUTE_MANIFEST_001::I001",
            "QO-IF-I001",
            List.of("client_operation_id", "title", "objective", "horizon", "priority"),
            List.of("DuplicateOperationConflict", "ValidationError", "DependencyUnavailable"),
            true,
            "No conflicting existing op");

    public static final RouteDescriptor I002 = new RouteDescriptor(
            "I002",
            InterfaceType.COMMAND,
            "UpdateLearningGoal",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            TARGET_COMPONENT,
            "MASTER_CORE_ROUTE_MANIFEST_001::I002",
            "QO-IF-I002",
            List.of("goal_id", "expected_version", "patch", "client_operation_id"),
            List.of("VersionConflict", "ValidationError"),
            true,
            "Optimistic expected-version check");

    public static final RouteDescriptor I003 = new RouteDescriptor(
            "I003",
            InterfaceType.COMMAND,
            "PauseLearningGoal",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            TARGET_COMPONENT,
            "MASTER_CORE_ROUTE_MANIFEST_001::I003",
            "QO-IF-I003",
            List.of("goal_id", "expected_version", "client_operation_id"),
            List.of("VersionConflict", "InvalidState"),
            true,
            "Expected-version");

    public static final RouteDescriptor I004 = new RouteDescriptor(
            "I004",
            InterfaceType.COMMAND,
            "ResumeLearningGoal",
            OWNER_PATH,
            CAPABILITY_BINDING,
            PORT,
            TARGET_COMPONENT,
            "MASTER_CORE_ROUTE_MANIFEST_001::I004",
            "QO-IF-I004",
            List.of("goal_id", "expected_version", "client_operation_id"),
            List.of("VersionConflict", "InvalidState"),
            true,
            "Expected-version");

    private LearningGoalInboundHandlers() {}

    /** Exact 001C semantic command; transport field encoding remains unselected. */
    public record CreateLearningGoalCommand(
            Object clientOperationId,
            Object title,
            Object objective,
            Object horizon,
            Object priority) {
        public CreateLearningGoalCommand {
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
            title = InboundBindingContracts.requiredField(title, "title");
            objective = InboundBindingContracts.requiredField(objective, "objective");
            horizon = InboundBindingContracts.requiredField(horizon, "horizon");
            priority = InboundBindingContracts.requiredField(priority, "priority");
        }
    }

    public record UpdateLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object patch,
            Object clientOperationId) {
        public UpdateLearningGoalCommand {
            goalId = InboundBindingContracts.requiredField(goalId, "goal_id");
            expectedVersion = InboundBindingContracts.requiredField(
                    expectedVersion, "expected_version");
            patch = InboundBindingContracts.requiredField(patch, "patch");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public record PauseLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object clientOperationId) {
        public PauseLearningGoalCommand {
            goalId = InboundBindingContracts.requiredField(goalId, "goal_id");
            expectedVersion = InboundBindingContracts.requiredField(
                    expectedVersion, "expected_version");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    public record ResumeLearningGoalCommand(
            Object goalId,
            Object expectedVersion,
            Object clientOperationId) {
        public ResumeLearningGoalCommand {
            goalId = InboundBindingContracts.requiredField(goalId, "goal_id");
            expectedVersion = InboundBindingContracts.requiredField(
                    expectedVersion, "expected_version");
            clientOperationId = InboundBindingContracts.requiredField(
                    clientOperationId, "client_operation_id");
        }
    }

    /**
     * LEARNING semantic port only. Production implementations remain responsible
     * for provider-local idempotency/concurrency rules through the current CORE
     * persistence/transaction mechanics without transferring semantic ownership.
     */
    public interface LearningGoalControllerPort {
        Object createLearningGoal(CreateLearningGoalCommand command) throws Exception;
        Object updateLearningGoal(UpdateLearningGoalCommand command) throws Exception;
        Object pauseLearningGoal(PauseLearningGoalCommand command) throws Exception;
        Object resumeLearningGoal(ResumeLearningGoalCommand command) throws Exception;
    }

    /** Registers exactly I001-I004; duplicate/global route policy remains CORE-owned. */
    public static void registerAll(RegistrationSink sink, LearningGoalControllerPort controller) {
        Objects.requireNonNull(sink, "sink");
        Objects.requireNonNull(controller, "controller");
        sink.register(I001, envelope -> controller.createLearningGoal(
                payload(envelope, I001, CreateLearningGoalCommand.class)));
        sink.register(I002, envelope -> controller.updateLearningGoal(
                payload(envelope, I002, UpdateLearningGoalCommand.class)));
        sink.register(I003, envelope -> controller.pauseLearningGoal(
                payload(envelope, I003, PauseLearningGoalCommand.class)));
        sink.register(I004, envelope -> controller.resumeLearningGoal(
                payload(envelope, I004, ResumeLearningGoalCommand.class)));
    }

    private static <T> T payload(
            InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }
}
