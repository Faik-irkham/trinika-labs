import {
  definitionKey,
  endpointKey,
  type CircuitEndpoint,
  type CircuitGraph,
  type PartDefinition,
} from "./project";

export interface CircuitDiagnostic {
  code:
    | "invalid-id"
    | "duplicate-id"
    | "duplicate-definition"
    | "duplicate-terminal"
    | "invalid-internal-connection"
    | "missing-definition"
    | "missing-instance"
    | "missing-terminal"
    | "missing-junction"
    | "self-connection";
  message: string;
  entityId: string;
}

export interface CircuitNet {
  /** Deterministic within this topology; not a persistent project identity. */
  id: string;
  endpoints: readonly CircuitEndpoint[];
}

export type CircuitAnalysis =
  | { ok: true; nets: readonly CircuitNet[]; diagnostics: readonly [] }
  | { ok: false; nets: readonly []; diagnostics: readonly CircuitDiagnostic[] };

/**
 * Structural connectivity only. This does not solve voltage/current or prove
 * electrical safety. Definitions and the graph must already be typed data.
 */
export function analyzeCircuit(
  circuit: CircuitGraph,
  definitions: readonly PartDefinition[],
): CircuitAnalysis {
  const diagnostics: CircuitDiagnostic[] = [];
  const catalog = new Map<string, PartDefinition>();
  const report = (
    code: CircuitDiagnostic["code"],
    entityId: string,
    message: string,
  ) => diagnostics.push({ code, entityId, message });

  for (const definition of definitions) {
    const { id, version } = definition.reference;
    const key = definitionKey(definition.reference);
    if (!id.trim() || !version.trim()) {
      report("invalid-id", id, "Identitas dan versi definisi wajib diisi.");
    }
    if (catalog.has(key)) {
      report("duplicate-definition", id, "Definisi dengan versi sama terdaftar dua kali.");
    }
    catalog.set(key, definition);
    const terminalIds = new Set<string>();
    for (const terminal of definition.terminals) {
      if (!terminal.id.trim()) {
        report("invalid-id", id, "Identitas terminal wajib diisi.");
      }
      if (terminalIds.has(terminal.id)) {
        report("duplicate-terminal", id, `Terminal ${terminal.id} terdaftar dua kali.`);
      }
      terminalIds.add(terminal.id);
    }
    for (const group of definition.internalConnections) {
      if (
        group.length < 2 ||
        new Set(group).size !== group.length ||
        group.some((terminalId) => !terminalIds.has(terminalId))
      ) {
        report("invalid-internal-connection", id, "Koneksi internal harus berisi minimal dua terminal berbeda yang tersedia.");
      }
    }
  }

  // A shared entity namespace prevents selection/history ambiguity across types.
  const entityIds = new Set<string>();
  for (const entity of [
    ...circuit.instances,
    ...circuit.junctions,
    ...circuit.wires,
  ]) {
    if (!entity.id.trim()) report("invalid-id", entity.id, "Identitas elemen wajib diisi.");
    if (entityIds.has(entity.id)) {
      report("duplicate-id", entity.id, "Identitas elemen rangkaian harus unik.");
    }
    entityIds.add(entity.id);
  }

  const instances = new Map(circuit.instances.map((instance) => [instance.id, instance]));
  const junctions = new Set(circuit.junctions.map((junction) => junction.id));
  for (const instance of circuit.instances) {
    if (!catalog.has(definitionKey(instance.definition))) {
      report("missing-definition", instance.id, `Definisi ${instance.definition.id}@${instance.definition.version} tidak tersedia.`);
    }
  }

  function validateEndpoint(endpoint: CircuitEndpoint, wireId: string) {
    if (endpoint.kind === "junction") {
      if (!junctions.has(endpoint.junctionId)) {
        report("missing-junction", wireId, `Junction ${endpoint.junctionId} tidak tersedia.`);
      }
      return;
    }
    const instance = instances.get(endpoint.instanceId);
    if (!instance) {
      report("missing-instance", wireId, `Komponen ${endpoint.instanceId} tidak tersedia.`);
      return;
    }
    const definition = catalog.get(definitionKey(instance.definition));
    if (definition && !definition.terminals.some((terminal) => terminal.id === endpoint.terminalId)) {
      report("missing-terminal", wireId, `Terminal ${endpoint.terminalId} tidak tersedia pada ${endpoint.instanceId}.`);
    }
  }

  for (const wire of circuit.wires) {
    validateEndpoint(wire.from, wire.id);
    validateEndpoint(wire.to, wire.id);
    if (endpointKey(wire.from) === endpointKey(wire.to)) {
      report("self-connection", wire.id, "Kabel harus menghubungkan dua endpoint berbeda.");
    }
  }

  // Never produce plausible-looking nets from an invalid graph.
  if (diagnostics.length > 0) return { ok: false, nets: [], diagnostics };

  const endpoints = new Map<string, CircuitEndpoint>();
  const parents = new Map<string, string>();
  const ranks = new Map<string, number>();

  function add(endpoint: CircuitEndpoint) {
    const key = endpointKey(endpoint);
    endpoints.set(key, endpoint);
    parents.set(key, key);
    ranks.set(key, 0);
    return key;
  }

  function root(key: string): string {
    let current = key;
    while (parents.get(current)! !== current) current = parents.get(current)!;
    while (key !== current) {
      const next = parents.get(key)!;
      parents.set(key, current);
      key = next;
    }
    return current;
  }

  function join(first: string, second: string) {
    let a = root(first);
    let b = root(second);
    if (a === b) return;
    if (ranks.get(a)! < ranks.get(b)!) [a, b] = [b, a];
    parents.set(b, a);
    if (ranks.get(a) === ranks.get(b)) ranks.set(a, ranks.get(a)! + 1);
  }

  for (const instance of circuit.instances) {
    const definition = catalog.get(definitionKey(instance.definition))!;
    for (const terminal of definition.terminals) {
      add({ kind: "terminal", instanceId: instance.id, terminalId: terminal.id });
    }
    for (const group of definition.internalConnections) {
      const keys = group.map((terminalId) =>
        endpointKey({ kind: "terminal", instanceId: instance.id, terminalId }),
      );
      for (const key of keys.slice(1)) join(keys[0], key);
    }
  }
  for (const junction of circuit.junctions) {
    add({ kind: "junction", junctionId: junction.id });
  }
  for (const wire of circuit.wires) join(endpointKey(wire.from), endpointKey(wire.to));

  const groups = new Map<string, string[]>();
  for (const key of endpoints.keys()) {
    const groupId = root(key);
    const group = groups.get(groupId) ?? [];
    group.push(key);
    groups.set(groupId, group);
  }
  const sortedGroups = [...groups.values()].map((keys) => keys.sort());
  sortedGroups.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return {
    ok: true,
    diagnostics: [],
    nets: sortedGroups.map((keys) => ({
      id: keys[0],
      endpoints: keys.map((key) => endpoints.get(key)!),
    })),
  };
}
