/** Serializable domain data. No renderer, framework, or browser dependencies. */
export const PROJECT_SCHEMA_VERSION = 1 as const;

export interface DefinitionReference {
  id: string;
  version: string;
}

export interface TerminalDefinition {
  id: string;
  label: string;
  kind: "digital" | "analog" | "power" | "ground" | "passive";
}

export interface PartDefinition {
  reference: DefinitionReference;
  kind: "board" | "component";
  label: string;
  terminals: readonly TerminalDefinition[];
  /** Explicit internal conductivity, e.g. a breadboard row. Not visual geometry. */
  internalConnections: readonly (readonly string[])[];
}

export interface TerminalEndpoint {
  kind: "terminal";
  instanceId: string;
  terminalId: string;
}

export interface JunctionEndpoint {
  kind: "junction";
  junctionId: string;
}

export type CircuitEndpoint = TerminalEndpoint | JunctionEndpoint;

export interface PartInstance {
  id: string;
  definition: DefinitionReference;
  properties: Readonly<Record<string, string | number | boolean>>;
}

export interface Wire {
  id: string;
  from: CircuitEndpoint;
  to: CircuitEndpoint;
}

export interface CircuitGraph {
  instances: readonly PartInstance[];
  wires: readonly Wire[];
  junctions: readonly { id: string }[];
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface PresentationDocument {
  wiring2d: Readonly<Record<string, { x: number; y: number; rotation: number }>>;
  /** One scene unit = one meter; +Y is up. Layout cannot create connectivity. */
  scene3d: Readonly<
    Record<string, { position: Vector3; rotation: Vector3; scale: Vector3 }>
  >;
  schematic: Readonly<Record<string, { x: number; y: number; rotation: number }>>;
}

export interface ProjectDocument {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  revision: number;
  title: string;
  files: readonly { path: string; content: string }[];
  targets: readonly {
    id: string;
    boardInstanceId: string;
    framework: DefinitionReference;
    entryPoint: string;
  }[];
  circuit: CircuitGraph;
  presentation: PresentationDocument;
  dependencies: readonly DefinitionReference[];
}

/** Initial in-memory document. Import validation/migrations are separate work. */
export function createProject(id: string, title: string): ProjectDocument {
  if (!id.trim() || !title.trim()) {
    throw new Error("Project ID and title must not be empty.");
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    revision: 0,
    title,
    files: [],
    targets: [],
    circuit: { instances: [], wires: [], junctions: [] },
    presentation: { wiring2d: {}, scene3d: {}, schematic: {} },
    dependencies: [],
  };
}

/** Tuple encoding avoids ambiguous IDs such as ["a:b", "c"] vs ["a", "b:c"]. */
export function endpointKey(endpoint: CircuitEndpoint): string {
  return endpoint.kind === "terminal"
    ? JSON.stringify(["terminal", endpoint.instanceId, endpoint.terminalId])
    : JSON.stringify(["junction", endpoint.junctionId]);
}

export function definitionKey(reference: DefinitionReference): string {
  return JSON.stringify([reference.id, reference.version]);
}
