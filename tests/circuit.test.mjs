import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCircuit } from "../.test-build/core/domain/circuit.js";
import { createProject, endpointKey } from "../.test-build/core/domain/project.js";
import { connectWire } from "../.test-build/core/application/connect-wire.js";

// Synthetic fixtures exercise topology without claiming support for a real MCU.
const definition = {
  reference: { id: "test:part", version: "1.0.0" },
  kind: "component",
  label: "Test part",
  terminals: ["a", "b", "c"].map((id) => ({ id, label: id, kind: "passive" })),
  internalConnections: [],
};
const breadboard = {
  ...definition,
  reference: { id: "test:breadboard", version: "1.0.0" },
  internalConnections: [["a", "b"]],
};
const definitions = [definition, breadboard];
const terminal = (instanceId, terminalId) => ({ kind: "terminal", instanceId, terminalId });
const junction = (junctionId) => ({ kind: "junction", junctionId });
const instance = (id, reference = definition.reference) => ({ id, definition: reference, properties: {} });
const wire = (id, from, to) => ({ id, from, to });
const graph = (wires = []) => ({
  instances: [instance("left"), instance("right")],
  junctions: [],
  wires,
});

function findNet(analysis, endpoint) {
  assert.equal(analysis.ok, true);
  return analysis.nets.find((net) => net.endpoints.some((item) => endpointKey(item) === endpointKey(endpoint)));
}

function deepFreeze(value) {
  for (const item of Object.values(value)) {
    if (item && typeof item === "object") deepFreeze(item);
  }
  return Object.freeze(value);
}

test("new projects have independent state and no renderer/runtime objects", () => {
  const first = createProject("first", "Proyek pertama");
  const second = createProject("second", "Proyek kedua");
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.revision, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.notEqual(first.circuit.instances, second.circuit.instances);
  assert.notEqual(first.presentation.scene3d, second.presentation.scene3d);
  assert.throws(() => createProject(" ", "Valid title"));
  assert.throws(() => createProject("valid", " "));
});

test("unconnected terminals remain distinct and empty circuits are valid", () => {
  const analysis = analyzeCircuit(graph(), definitions);
  assert.equal(analysis.ok, true);
  assert.equal(analysis.nets.length, 6);
  assert.notEqual(findNet(analysis, terminal("left", "a")), findNet(analysis, terminal("right", "a")));
  assert.deepEqual(analyzeCircuit(createProject("empty", "Empty").circuit, []), {
    ok: true,
    nets: [],
    diagnostics: [],
  });
});

test("wire chains and cycles form one net without merging unrelated terminals", () => {
  const a = terminal("left", "a");
  const b = terminal("right", "a");
  const c = terminal("right", "b");
  const analysis = analyzeCircuit(graph([
    wire("w1", a, b), wire("w2", b, c), wire("w3", c, a),
  ]), definitions);
  assert.equal(findNet(analysis, a).endpoints.length, 3);
  assert.equal(findNet(analysis, a), findNet(analysis, c));
  assert.notEqual(findNet(analysis, a), findNet(analysis, terminal("left", "b")));
});

test("branching requires an explicit junction", () => {
  const circuit = graph([
    wire("w1", terminal("left", "a"), junction("branch")),
    wire("w2", junction("branch"), terminal("right", "a")),
    wire("w3", junction("branch"), terminal("right", "b")),
  ]);
  circuit.junctions = [{ id: "branch" }];
  const analysis = analyzeCircuit(circuit, definitions);
  assert.equal(findNet(analysis, junction("branch")).endpoints.length, 4);
});

test("breadboard internal connections derive from its definition, not its layout", () => {
  const circuit = {
    instances: [instance("breadboard", breadboard.reference), instance("left")],
    junctions: [],
    wires: [wire("w1", terminal("left", "a"), terminal("breadboard", "a"))],
  };
  const analysis = analyzeCircuit(circuit, definitions);
  assert.equal(findNet(analysis, terminal("left", "a")), findNet(analysis, terminal("breadboard", "b")));
  assert.notEqual(findNet(analysis, terminal("breadboard", "a")), findNet(analysis, terminal("breadboard", "c")));
});

test("disconnected wires stay separate regardless of 2D/3D placement", () => {
  const project = {
    ...createProject("layouts", "Layouts"),
    circuit: graph([
      wire("w1", terminal("left", "a"), terminal("right", "a")),
      wire("w2", terminal("left", "b"), terminal("right", "b")),
    ]),
  };
  const before = analyzeCircuit(project.circuit, definitions);
  project.presentation.wiring2d = { left: { x: 0, y: 0, rotation: 0 }, right: { x: 0, y: 0, rotation: 0 } };
  project.presentation.scene3d = {
    left: { position: { x: 2, y: 4, z: 8 }, rotation: { x: 0, y: 1, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  };
  assert.deepEqual(analyzeCircuit(project.circuit, definitions), before);
  assert.notEqual(findNet(before, terminal("left", "a")), findNet(before, terminal("left", "b")));
});

test("net output is deterministic under instance, wire, and endpoint reordering", () => {
  const circuit = graph([
    wire("w1", terminal("left", "a"), terminal("right", "b")),
    wire("w2", terminal("right", "b"), terminal("left", "c")),
  ]);
  const reordered = {
    ...circuit,
    instances: [...circuit.instances].reverse(),
    wires: [...circuit.wires].reverse().map((item) => ({ ...item, from: item.to, to: item.from })),
  };
  assert.deepEqual(analyzeCircuit(circuit, definitions), analyzeCircuit(reordered, [...definitions].reverse()));
});

test("stable endpoint identities cannot collide across delimiters or entity kinds", () => {
  assert.notEqual(endpointKey(terminal("a:b", "c")), endpointKey(terminal("a", "b:c")));
  assert.notEqual(endpointKey(terminal("a", "b")), endpointKey(junction("a:b")));
});

const invalidCases = [
  ["duplicate-id", () => ({ ...graph(), junctions: [{ id: "left" }] }), definitions],
  ["invalid-id", () => ({ ...graph(), junctions: [{ id: " " }] }), definitions],
  ["missing-instance", () => graph([wire("w", terminal("missing", "a"), terminal("right", "a"))]), definitions],
  ["missing-terminal", () => graph([wire("w", terminal("left", "missing"), terminal("right", "a"))]), definitions],
  ["missing-junction", () => graph([wire("w", junction("missing"), terminal("right", "a"))]), definitions],
  ["self-connection", () => graph([wire("w", terminal("left", "a"), terminal("left", "a"))]), definitions],
  ["missing-definition", () => ({ ...graph(), instances: [instance("left", { id: "test:part", version: "2.0.0" })] }), definitions],
  ["duplicate-definition", () => graph(), [definition, definition]],
  ["duplicate-terminal", () => graph(), [{ ...definition, terminals: [...definition.terminals, definition.terminals[0]] }]],
  ["invalid-internal-connection", () => graph(), [{ ...definition, internalConnections: [["a", "missing"]] }]],
  ["invalid-internal-connection", () => graph(), [{ ...definition, internalConnections: [["a", "a"]] }]],
];
for (const [code, makeCircuit, catalog] of invalidCases) {
  test(`invalid topology produces ${code} and no partial nets`, () => {
    const analysis = analyzeCircuit(makeCircuit(), catalog);
    assert.equal(analysis.ok, false);
    assert.deepEqual(analysis.nets, []);
    assert.ok(analysis.diagnostics.some((diagnostic) => diagnostic.code === code));
  });
}

test("removing a connection rebuilds the nets instead of keeping stale connectivity", () => {
  const connected = graph([wire("w1", terminal("left", "a"), terminal("right", "a"))]);
  const disconnected = { ...connected, wires: [] };
  assert.equal(analyzeCircuit(connected, definitions).nets.length, 5);
  assert.equal(analyzeCircuit(disconnected, definitions).nets.length, 6);
});

test("connect command is atomic, increments revision, and preserves the original snapshot", () => {
  const project = deepFreeze({ ...createProject("test", "Test"), circuit: graph() });
  const result = connectWire(project, wire("w1", terminal("left", "a"), terminal("right", "a")), definitions);
  assert.equal(result.ok, true);
  assert.equal(result.project.revision, 1);
  assert.equal(result.project.circuit.wires.length, 1);
  assert.equal(project.revision, 0);
  assert.equal(project.circuit.wires.length, 0);
  assert.equal(result.project.presentation, project.presentation);
});

test("failed connect leaves the document and its revision unchanged", () => {
  const project = deepFreeze({ ...createProject("test", "Test"), circuit: graph() });
  const result = connectWire(project, wire("w1", terminal("left", "missing"), terminal("right", "a")), definitions);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((item) => item.code === "missing-terminal"));
  assert.equal(project.revision, 0);
  assert.equal(project.circuit.wires.length, 0);
});
