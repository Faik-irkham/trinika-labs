import { analyzeCircuit } from "../domain/circuit";
import {
  PROJECT_SCHEMA_VERSION,
  definitionKey,
  type CircuitEndpoint,
  type DefinitionReference,
  type ProjectDocument,
} from "../domain/project";
import { isPinnedReference, type DefinitionRegistry } from "../domain/registry";
import { array, isRecord, literal, number, object, record, scalar, text, type Decoder, type FormatIssue } from "./decoder";

export const MAX_PROJECT_JSON_LENGTH = 1_000_000;

export interface ProjectFormatDiagnostic {
  code:
    | "invalid-json" | "too-large" | "unsupported-version" | "invalid-data"
    | "unknown-field" | "invalid-circuit" | "duplicate-reference"
    | "missing-dependency" | "invalid-target" | "invalid-layout" | "duplicate-file";
  path: string;
  message: string;
}

export type ProjectImportResult =
  | { ok: true; project: ProjectDocument }
  | { ok: false; diagnostics: readonly ProjectFormatDiagnostic[] };

const reference: Decoder<DefinitionReference> = object({ id: text(256), version: text(128) });
const vector = object({ x: number(), y: number(), z: number() });
const scale = object({ x: number((n) => n > 0), y: number((n) => n > 0), z: number((n) => n > 0) });
const layout2d = object({ x: number(), y: number(), rotation: number() });
const terminal = object({ kind: literal("terminal"), instanceId: text(256), terminalId: text(256) });
const junction = object({ kind: literal("junction"), junctionId: text(256) });

const endpoint: Decoder<CircuitEndpoint> = (value, path, issues) => {
  if (isRecord(value) && value.kind === "terminal") return terminal(value, path, issues);
  if (isRecord(value) && value.kind === "junction") return junction(value, path, issues);
  issues.push({ code: "invalid-data", path, message: "Endpoint harus terminal atau junction." });
};

/** Relative portable POSIX paths only; no traversal, drive letters, or URL paths. */
export function isProjectFilePath(path: string): boolean {
  return path.length > 0 && path.length <= 256 && !/[\\:\u0000-\u001f\u007f]/.test(path) &&
    path.split("/").every((segment) => segment.trim().length > 0 && segment !== "." && segment !== "..");
}

const filePath: Decoder<string> = (value, path, issues) => {
  const decoded = text(256)(value, path, issues);
  if (decoded === undefined) return;
  if (isProjectFilePath(decoded)) return decoded;
  issues.push({ code: "invalid-data", path, message: "Path file harus relatif, tanpa traversal atau separator platform lain." });
};

const document: Decoder<ProjectDocument> = object({
  schemaVersion: literal(PROJECT_SCHEMA_VERSION),
  id: text(256),
  revision: number((n) => Number.isSafeInteger(n) && n >= 0),
  title: text(256),
  files: array(object({ path: filePath, content: text(500_000, true) }), 500),
  targets: array(object({
    id: text(256), boardInstanceId: text(256), framework: reference, entryPoint: filePath,
  }), 100),
  circuit: object({
    instances: array(object({ id: text(256), definition: reference, properties: record(scalar, 100) })),
    wires: array(object({ id: text(256), from: endpoint, to: endpoint })),
    junctions: array(object({ id: text(256) })),
  }),
  presentation: object({
    wiring2d: record(layout2d),
    schematic: record(layout2d),
    scene3d: record(object({ position: vector, rotation: vector, scale })),
  }),
  dependencies: array(reference, 500),
});

/** Import boundary: reconstruct known fields, validate references, never execute. */
export function parseProjectJson(json: string, registry: DefinitionRegistry): ProjectImportResult {
  if (json.length > MAX_PROJECT_JSON_LENGTH) {
    return { ok: false, diagnostics: [{ code: "too-large", path: "$", message: "Dokumen melebihi batas satu juta UTF-16 code unit." }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, diagnostics: [{ code: "invalid-json", path: "$", message: "File bukan JSON yang valid." }] };
  }
  if (isRecord(value) && typeof value.schemaVersion === "number" && value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return { ok: false, diagnostics: [{ code: "unsupported-version", path: "$.schemaVersion", message: "Versi proyek belum didukung; dokumen tidak dimigrasi atau ditimpa." }] };
  }
  const formatIssues: FormatIssue[] = [];
  const project = document(value, "$", formatIssues);
  if (!project) return { ok: false, diagnostics: formatIssues };
  const diagnostics: ProjectFormatDiagnostic[] = [];
  const report = (code: ProjectFormatDiagnostic["code"], path: string, message: string) =>
    diagnostics.push({ code, path, message });

  const dependencies = new Set<string>();
  project.dependencies.forEach((dependency, index) => {
    const path = `$.dependencies[${index}]`;
    if (!isPinnedReference(dependency)) report("invalid-data", path, "Dependency harus memiliki ID namespaced dan versi tepat.");
    const key = definitionKey(dependency);
    if (dependencies.has(key)) report("duplicate-reference", path, "Dependency dengan versi sama dicatat dua kali.");
    dependencies.add(key);
  });

  function requireDependency(dependency: DefinitionReference, path: string) {
    if (!isPinnedReference(dependency)) report("invalid-data", path, "Referensi harus memiliki ID namespaced dan versi tepat.");
    if (!dependencies.has(definitionKey(dependency))) report("missing-dependency", path, "Referensi belum dikunci pada daftar dependency proyek.");
  }
  project.circuit.instances.forEach((instance, index) => {
    requireDependency(instance.definition, `$.circuit.instances[${index}].definition`);
  });

  const circuit = analyzeCircuit(project.circuit, registry.list().map((entry) => entry.definition));
  if (!circuit.ok) {
    for (const issue of circuit.diagnostics) {
      report("invalid-circuit", "$.circuit", `${issue.entityId}: ${issue.message}`);
    }
  }
  const filePaths = new Set<string>();
  project.files.forEach((file, index) => {
    if (filePaths.has(file.path)) report("duplicate-file", `$.files[${index}].path`, "Path file harus unik.");
    filePaths.add(file.path);
  });
  const instances = new Map(project.circuit.instances.map((instance) => [instance.id, instance]));
  const targetIds = new Set<string>();
  project.targets.forEach((target, index) => {
    const path = `$.targets[${index}]`;
    if (targetIds.has(target.id)) report("invalid-target", `${path}.id`, "Identitas target harus unik.");
    targetIds.add(target.id);
    const instance = instances.get(target.boardInstanceId);
    if (!instance || registry.resolve(instance.definition)?.definition.kind !== "board") {
      report("invalid-target", `${path}.boardInstanceId`, "Target harus menunjuk instance board yang tersedia.");
    }
    if (!filePaths.has(target.entryPoint)) report("invalid-target", `${path}.entryPoint`, "Entry point tidak tersedia dalam file proyek.");
    requireDependency(target.framework, `${path}.framework`);
  });
  for (const [view, layouts] of Object.entries(project.presentation)) {
    for (const instanceId of Object.keys(layouts)) {
      if (!instances.has(instanceId)) {
        report("invalid-layout", `$.presentation.${view}[${JSON.stringify(instanceId)}]`, "Layout harus menunjuk instance komponen yang tersedia.");
      }
    }
  }
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, project };
}

/** Export uses the same boundary checks. Never silently writes invalid documents. */
export function serializeProjectJson(project: ProjectDocument, registry: DefinitionRegistry):
  | { ok: true; json: string }
  | { ok: false; diagnostics: readonly ProjectFormatDiagnostic[] } {
  let json: string;
  try {
    json = JSON.stringify(project);
  } catch {
    return { ok: false, diagnostics: [{ code: "invalid-data", path: "$", message: "Dokumen tidak dapat ditulis sebagai JSON." }] };
  }
  const result = parseProjectJson(json, registry);
  return result.ok ? { ok: true, json } : result;
}
