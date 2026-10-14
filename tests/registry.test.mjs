import assert from "node:assert/strict";
import test from "node:test";
import { createRegistry } from "../.test-build/core/domain/registry.js";

const entry = (id = "test:board", version = "1.0.0", kind = "board") => ({
  definition: {
    reference: { id, version }, kind, label: "Synthetic fixture",
    terminals: [{ id: "gpio-1", label: "GPIO 1", kind: "digital" }],
    internalConnections: [],
  },
  capabilities: {
    visual3d: { status: "planned", note: "Aset belum tersedia.", evidence: [] },
  },
});

test("registry keeps board families and exact versions distinct", () => {
  const result = createRegistry([
    entry("test:avr-board"), entry("test:esp-board"),
    entry("test:avr-board", "2.0.0"), entry("test:led", "1.0.0", "component"),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.registry.list("board").length, 3);
  assert.equal(result.registry.list("component").length, 1);
  assert.equal(result.registry.resolve({ id: "test:avr-board", version: "2.0.0" }).definition.reference.version, "2.0.0");
  assert.equal(result.registry.resolve({ id: "test:avr-board", version: "3.0.0" }), undefined);
});

test("missing capability stays unsupported instead of inheriting visual support", () => {
  const result = createRegistry([entry()]);
  assert.equal(result.ok, true);
  const reference = entry().definition.reference;
  assert.equal(result.registry.support(reference, "visual3d").status, "planned");
  assert.equal(result.registry.support(reference, "simulate.gpio").status, "unsupported");
  assert.equal(result.registry.support(reference, "upload").status, "unsupported");
  assert.equal(result.registry.support({ ...reference, version: "2.0.0" }, "visual3d").status, "unsupported");
});

test("verified capability requires version-specific evidence", () => {
  const candidate = entry();
  candidate.capabilities["simulate.gpio"] = { status: "verified", note: "Fixture only", evidence: [] };
  const rejected = createRegistry([candidate]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostics[0].code, "invalid-capability");
  candidate.capabilities["simulate.gpio"].evidence = ["tests/synthetic-gpio@1.0.0"];
  assert.equal(createRegistry([candidate]).ok, true);
});

test("registration snapshots cannot be mutated by the caller or resolved values", () => {
  const candidate = entry();
  const reference = { ...candidate.definition.reference };
  const result = createRegistry([candidate]);
  assert.equal(result.ok, true);
  candidate.definition.terminals[0].label = "Changed";
  candidate.definition.reference.version = "9.0.0";
  candidate.capabilities.visual3d.note = "Changed";
  const resolved = result.registry.resolve(reference);
  assert.equal(resolved.definition.terminals[0].label, "GPIO 1");
  assert.equal(resolved.capabilities.visual3d.note, "Aset belum tersedia.");
  assert.throws(() => { resolved.definition.terminals[0].label = "Tampered"; });
  assert.throws(() => { resolved.capabilities.visual3d.evidence.push("Tampered"); });
  assert.throws(() => { result.registry.list().push(candidate); });
});

test("duplicate registry versions and invalid internal connections fail atomically", () => {
  assert.equal(createRegistry([entry(), entry()]).ok, false);
  const broken = entry();
  broken.definition.internalConnections = [["gpio-1", "missing"]];
  const result = createRegistry([broken]);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((issue) => issue.code === "invalid-definition"));
  assert.equal("registry" in result, false);
});

for (const [id, version] of [["board", "1.0.0"], ["test:board", "^1.0.0"], ["test:board", "latest"], ["test:board", "01.0.0"]]) {
  test(`registry rejects unpinned reference ${id}@${version}`, () => {
    const result = createRegistry([entry(id, version)]);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((issue) => issue.code === "invalid-reference"));
  });
}

test("registry rejects unknown capabilities and empty support explanations", () => {
  const unknown = entry();
  unknown.capabilities.magic = { status: "verified", note: "Unknown", evidence: ["test"] };
  assert.equal(createRegistry([unknown]).ok, false);
  const unexplained = entry();
  unexplained.capabilities.visual3d.note = " ";
  assert.equal(createRegistry([unexplained]).ok, false);
});
