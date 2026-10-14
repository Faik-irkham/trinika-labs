import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "../.test-build/core/domain/project.js";
import { createRegistry } from "../.test-build/core/domain/registry.js";
import { MAX_PROJECT_JSON_LENGTH, parseProjectJson, serializeProjectJson } from "../.test-build/core/project-format/project-json.js";

const board = {
  reference: { id: "test:board", version: "1.0.0" }, kind: "board", label: "Synthetic board",
  terminals: [{ id: "gpio", label: "GPIO", kind: "digital" }], internalConnections: [],
};
const component = {
  reference: { id: "test:led", version: "1.0.0" }, kind: "component", label: "Synthetic LED",
  terminals: [{ id: "anode", label: "+", kind: "passive" }], internalConnections: [],
};
const registryResult = createRegistry([board, component].map((definition) => ({ definition, capabilities: {} })));
assert.equal(registryResult.ok, true);
const registry = registryResult.registry;
const framework = { id: "test:framework", version: "1.0.0" };

function fixture() {
  const project = createProject("example", "Contoh proyek");
  project.files = [{ path: "src/main.cpp", content: "// fixture, not executable firmware" }];
  project.circuit.instances = [
    { id: "board", definition: board.reference, properties: {} },
    { id: "led", definition: component.reference, properties: { color: "red", enabled: true, value: 1 } },
  ];
  project.circuit.wires = [{
    id: "wire", from: { kind: "terminal", instanceId: "board", terminalId: "gpio" },
    to: { kind: "terminal", instanceId: "led", terminalId: "anode" },
  }];
  project.targets = [{ id: "main", boardInstanceId: "board", framework, entryPoint: "src/main.cpp" }];
  project.dependencies = [board.reference, component.reference, framework];
  project.presentation.wiring2d = { board: { x: 1, y: 2, rotation: 0 } };
  project.presentation.scene3d = { board: {
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
  } };
  return structuredClone(project);
}

test("project round-trip preserves source, locks, topology, and 2D/3D layouts", () => {
  const original = fixture();
  const encoded = serializeProjectJson(original, registry);
  assert.equal(encoded.ok, true);
  const decoded = parseProjectJson(encoded.json, registry);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.project, original);
  assert.notEqual(decoded.project.circuit, original.circuit);
  assert.equal(registry.support(board.reference, "build").status, "unsupported");
});

test("an empty local project can be imported without a target or registry entries", () => {
  const emptyRegistry = createRegistry([]).registry;
  assert.equal(parseProjectJson(JSON.stringify(createProject("empty", "Empty")), emptyRegistry).ok, true);
});

test("malformed and oversized input fail without returning a partial document", () => {
  for (const [json, code] of [["{", "invalid-json"], [" ".repeat(MAX_PROJECT_JSON_LENGTH + 1), "too-large"]]) {
    const result = parseProjectJson(json, registry);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0].code, code);
    assert.equal("project" in result, false);
  }
});

test("newer schema versions are rejected without dropping unfamiliar fields", () => {
  const project = { ...fixture(), schemaVersion: 2, futureFeature: { enabled: true } };
  const result = parseProjectJson(JSON.stringify(project), registry);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "unsupported-version");
  assert.equal(project.schemaVersion, 2);
});

const invalidCases = [
  ["invalid-data", "$.revision", (p) => { p.revision = -1; }],
  ["invalid-data", "$.revision", (p) => { p.revision = 1.5; }],
  ["invalid-data", "$.circuit.instances", (p) => { p.circuit.instances = null; }],
  ["invalid-data", "$.circuit.wires[0].from", (p) => { p.circuit.wires[0].from.kind = "mesh"; }],
  ["invalid-data", "$.presentation.scene3d", (p) => { p.presentation.scene3d.board.scale.x = 0; }],
  ["invalid-data", "$.presentation.scene3d", (p) => { p.presentation.scene3d.board.position.x = "1"; }],
  ["unknown-field", "$.future", (p) => { p.future = true; }],
  ["unknown-field", "$.files[0].extra", (p) => { p.files[0].extra = true; }],
  ["invalid-circuit", "$.circuit", (p) => { p.circuit.wires[0].to.terminalId = "missing"; }],
  ["invalid-circuit", "$.circuit", (p) => { p.circuit.instances[0].definition.version = "2.0.0"; p.dependencies.push({ id: "test:board", version: "2.0.0" }); }],
  ["missing-dependency", "$.circuit.instances[0].definition", (p) => { p.dependencies = p.dependencies.filter((d) => d.id !== board.reference.id); }],
  ["duplicate-reference", "$.dependencies", (p) => { p.dependencies.push(p.dependencies[0]); }],
  ["invalid-data", "$.dependencies", (p) => { p.dependencies[0].version = "latest"; }],
  ["invalid-target", "$.targets[0].boardInstanceId", (p) => { p.targets[0].boardInstanceId = "led"; }],
  ["invalid-target", "$.targets[0].entryPoint", (p) => { p.targets[0].entryPoint = "missing.cpp"; }],
  ["invalid-target", "$.targets[1].id", (p) => { p.targets.push(p.targets[0]); }],
  ["missing-dependency", "$.targets[0].framework", (p) => { p.dependencies = p.dependencies.filter((d) => d.id !== framework.id); }],
  ["duplicate-file", "$.files", (p) => { p.files.push(p.files[0]); }],
  ["invalid-layout", "$.presentation.wiring2d", (p) => { p.presentation.wiring2d.missing = { x: 0, y: 0, rotation: 0 }; }],
  ["invalid-data", "$.circuit.instances[1].properties", (p) => { p.circuit.instances[1].properties.nested = { script: "no" }; }],
];
for (const [code, path, mutate] of invalidCases) {
  test(`import rejects ${code} at ${path}`, () => {
    const project = fixture();
    mutate(project);
    const result = parseProjectJson(JSON.stringify(project), registry);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((issue) => issue.code === code && issue.path.startsWith(path)), JSON.stringify(result));
    assert.equal("project" in result, false);
  });
}

for (const path of ["../main.cpp", "/main.cpp", "a/../main.cpp", "C:/main.cpp", "src\\main.cpp", "a//main.cpp", "./main.cpp", "https://example.com/main.cpp"]) {
  test(`import rejects nonportable file path ${path}`, () => {
    const project = fixture();
    project.files[0].path = path;
    const result = parseProjectJson(JSON.stringify(project), registry);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((issue) => issue.path === "$.files[0].path"));
  });
}

test("hostile dictionary keys cannot become prototype properties", () => {
  const project = fixture();
  project.circuit.instances[1].properties = JSON.parse('{"__proto__":{"polluted":true}}');
  const result = parseProjectJson(JSON.stringify(project), registry);
  assert.equal(result.ok, false);
  assert.equal({}.polluted, undefined);
});

test("overflow numeric literals and nonfinite exports are rejected", () => {
  const json = JSON.stringify(fixture()).replace('"revision":0', '"revision":1e999');
  assert.equal(parseProjectJson(json, registry).ok, false);
  const project = fixture();
  project.presentation.scene3d.board.position.x = Infinity;
  assert.equal(serializeProjectJson(project, registry).ok, false);
});
