/**
 * @bureau/task-machine
 *
 * XState 5 task lifecycle state machine.
 * Persistable: snapshot can be stored in MongoDB and restored.
 */
export {
  taskMachine,
  stateToStage,
  type TaskContext,
  type TaskEvent,
  type TaskMachine,
  type TaskMachineActor,
} from "./machine.js";
