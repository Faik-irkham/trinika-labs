import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceController } from "../.test-build/features/workspace/viewmodels/workspace-controller.js";
import { pointFor } from "../.test-build/features/workspace/viewmodels/projection.js";
import { starterRegistry } from "../.test-build/core/catalog/starter-catalog.js";
import { parseProjectJson } from "../.test-build/core/project-format/project-json.js";

const pin = (instanceId, terminalId) => ({ kind: "terminal", instanceId, terminalId });
const reference = (name) => ({ id: `core:${name}`, version: "1.0.0" });

test("starter catalog opens a valid project without pretending to run firmware", () => {
  const controller = new WorkspaceController();
  const snapshot = controller.getSnapshot();
  assert.equal(parseProjectJson(controller.exportJson(), starterRegistry).ok, true);
  assert.equal(snapshot.project.circuit.instances.length, 4);
  assert.equal(snapshot.project.targets.length, 0);
  assert.equal(starterRegistry.support(reference("training-board"), "build").status, "unsupported");
});

test("adding parts uses unique IDs and locks their definitions", () => {
  const controller = new WorkspaceController();
  controller.addPart(reference("breadboard-row"));
  controller.addPart(reference("breadboard-row"));
  const project = controller.getSnapshot().project;
  assert.equal(project.circuit.instances.length, 6);
  assert.equal(new Set(project.circuit.instances.map((p) => p.id)).size, 6);
  assert.equal(project.dependencies.filter((p) => p.id === "core:breadboard-row").length, 1);
  assert.equal(controller.getSnapshot().selection.kind, "instance");
  assert.equal(parseProjectJson(controller.exportJson(), starterRegistry).ok, true);
});

test("unknown parts cannot modify the project", () => {
  const controller = new WorkspaceController();
  const project = controller.getSnapshot().project;
  controller.addPart(reference("missing"));
  assert.equal(controller.getSnapshot().project, project);
  assert.equal(controller.getSnapshot().notice.tone, "error");
});

test("two terminal selections connect atomically and duplicate wires are rejected", () => {
  const controller = new WorkspaceController();
  controller.chooseTerminal(pin("button-1", "a"));
  assert.equal(controller.getSnapshot().project.circuit.wires.length, 3);
  controller.chooseTerminal(pin("board-1", "io-2"));
  assert.equal(controller.getSnapshot().project.circuit.wires.length, 4);
  assert.equal(controller.getSnapshot().pendingTerminal, null);
  const project = controller.getSnapshot().project;
  controller.chooseTerminal(pin("board-1", "io-2"));
  controller.chooseTerminal(pin("button-1", "a"));
  assert.equal(controller.getSnapshot().project, project);
  assert.equal(controller.getSnapshot().notice.tone, "error");
});

test("invalid terminals and cancelling connections preserve topology", () => {
  const controller = new WorkspaceController();
  const project = controller.getSnapshot().project;
  controller.chooseTerminal(pin("board-1", "missing"));
  assert.equal(controller.getSnapshot().pendingTerminal, null);
  controller.chooseTerminal(pin("button-1", "a"));
  controller.cancelConnection();
  assert.equal(controller.getSnapshot().pendingTerminal, null);
  assert.equal(controller.getSnapshot().project, project);
});

test("moving a part changes presentation without altering circuit or 3D", () => {
  const controller = new WorkspaceController();
  const before = controller.getSnapshot();
  controller.movePart("board-1", 350, 250);
  const after = controller.getSnapshot();
  assert.equal(after.project.circuit, before.project.circuit);
  assert.equal(after.project.presentation.scene3d, before.project.presentation.scene3d);
  assert.equal(after.netCount, before.netCount);
  assert.equal(after.project.presentation.wiring2d["board-1"].x, 350);
  controller.movePart("board-1", Infinity, 100);
  assert.equal(controller.getSnapshot().project, after.project);
});

test("undo/redo recover complete documents and a new edit clears redo", () => {
  const controller = new WorkspaceController();
  const original = controller.getSnapshot().project;
  controller.movePart("led-1", 700, 200);
  const moved = controller.getSnapshot().project;
  controller.undo();
  assert.equal(controller.getSnapshot().project, original);
  controller.redo();
  assert.equal(controller.getSnapshot().project, moved);
  controller.undo();
  controller.rename("Proyek baru");
  assert.equal(controller.getSnapshot().redoCount, 0);
});

test("deleting a component removes attached wires/layout and can be undone", () => {
  const controller = new WorkspaceController();
  const original = controller.getSnapshot().project;
  controller.select({ kind: "instance", id: "led-1" });
  controller.removeSelected();
  const project = controller.getSnapshot().project;
  assert.equal(project.circuit.instances.some((p) => p.id === "led-1"), false);
  assert.equal(project.circuit.wires.length, 1);
  assert.equal("led-1" in project.presentation.wiring2d, false);
  assert.equal(parseProjectJson(controller.exportJson(), starterRegistry).ok, true);
  controller.undo();
  assert.equal(controller.getSnapshot().project, original);
});

test("deleting a wire keeps the components and rebuilds the nets", () => {
  const controller = new WorkspaceController();
  const before = controller.getSnapshot();
  controller.select({ kind: "wire", id: "wire-1" });
  controller.removeSelected();
  const after = controller.getSnapshot();
  assert.equal(after.project.circuit.instances.length, 4);
  assert.equal(after.project.circuit.wires.length, 2);
  assert.equal(after.netCount, before.netCount + 1);
});

test("component properties reject invalid values without partial changes", () => {
  const controller = new WorkspaceController();
  const original = controller.getSnapshot().project;
  controller.updateProperty("resistor-1", "resistance", 0);
  controller.updateProperty("button-1", "color", "green");
  controller.updateProperty("led-1", "label", " ");
  assert.equal(controller.getSnapshot().project, original);
  controller.updateProperty("resistor-1", "resistance", 330);
  assert.equal(controller.getSnapshot().project.circuit.instances.find((p) => p.id === "resistor-1").properties.resistance, 330);
});

test("editing source files is persisted and undoable without executing them", () => {
  const controller = new WorkspaceController();
  const original = controller.getSnapshot().project;
  controller.updateFile("main.cpp", "// experiment");
  const parsed = parseProjectJson(controller.exportJson(), starterRegistry);
  assert.equal(parsed.project.files[0].content, "// experiment");
  controller.undo();
  assert.equal(controller.getSnapshot().project, original);
});

test("local save/restore succeeds and quota failures leave the dirty state", () => {
  let saved = null;
  const store = { read: () => saved, write: (json) => { saved = json; } };
  const first = new WorkspaceController();
  first.rename("Disimpan lokal");
  first.saveLocal(store);
  assert.equal(first.getSnapshot().dirty, false);
  const restored = new WorkspaceController();
  restored.initializeLocal(store);
  assert.equal(restored.getSnapshot().project.title, "Disimpan lokal");
  assert.equal(restored.getSnapshot().dirty, false);
  restored.rename("Belum tersimpan");
  restored.saveLocal({ read: () => saved, write: () => { throw new Error("quota"); } });
  assert.equal(restored.getSnapshot().dirty, true);
  assert.equal(restored.getSnapshot().notice.tone, "error");
  assert.equal(JSON.parse(saved).title, "Disimpan lokal");
});

test("corrupt local data is never overwritten on initialization", () => {
  let writes = 0;
  const controller = new WorkspaceController();
  const original = controller.getSnapshot().project;
  controller.initializeLocal({ read: () => "{", write: () => { writes++; } });
  assert.equal(writes, 0);
  assert.equal(controller.getSnapshot().project, original);
  assert.equal(controller.getSnapshot().notice.tone, "error");
});

test("invalid imports preserve current edits; successful imports can be undone", () => {
  const controller = new WorkspaceController();
  controller.rename("Current work");
  const original = controller.getSnapshot().project;
  controller.importJson("{}");
  assert.equal(controller.getSnapshot().project, original);
  const other = new WorkspaceController();
  other.rename("Imported work");
  controller.importJson(other.exportJson());
  assert.equal(controller.getSnapshot().project.title, "Imported work");
  controller.undo();
  assert.equal(controller.getSnapshot().project, original);
});

test("save state accounts for uncommitted field drafts", () => {
  const controller = new WorkspaceController();
  controller.saveLocal({ read: () => null, write: () => {} });
  controller.markDraft();
  assert.equal(controller.getSnapshot().dirty, true);
  controller.finishDraft();
  assert.equal(controller.getSnapshot().dirty, false);
});

test("render projection rotates terminal anchors around the component center", () => {
  const project = new WorkspaceController().getSnapshot().project;
  const rotated = { ...project, presentation: { ...project.presentation, wiring2d: {
    ...project.presentation.wiring2d, "resistor-1": { x: 100, y: 100, rotation: 90 },
  } } };
  const point = pointFor(rotated, pin("resistor-1", "a"));
  assert.ok(Math.abs(point.x - 178) < 1e-9);
  assert.ok(Math.abs(point.y - 54) < 1e-9);
});
