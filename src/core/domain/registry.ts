import { analyzeCircuit } from "./circuit";
import { definitionKey, type DefinitionReference, type PartDefinition } from "./project";

export const CAPABILITIES = [
  "visual2d", "visual3d", "build", "upload", "debug",
  "simulate.gpio", "simulate.serial", "simulate.adc", "simulate.pwm",
  "simulate.i2c", "simulate.spi", "simulate.network", "simulate.analog",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type SupportStatus = "planned" | "experimental" | "partial" | "verified" | "unsupported";

export interface CapabilitySupport {
  status: SupportStatus;
  note: string;
  /** References to version-specific tests. Required to declare verified support. */
  evidence: readonly string[];
}

export interface RegistryEntry {
  definition: PartDefinition;
  /** Exact-version definition support; not effective support of an entire project. */
  capabilities: Readonly<Partial<Record<Capability, CapabilitySupport>>>;
}

export interface RegistryDiagnostic {
  code: "invalid-reference" | "invalid-definition" | "duplicate-reference" | "invalid-capability";
  reference: DefinitionReference;
  message: string;
}

export interface DefinitionRegistry {
  resolve(reference: DefinitionReference): RegistryEntry | undefined;
  list(kind?: PartDefinition["kind"]): readonly RegistryEntry[];
  support(reference: DefinitionReference, capability: Capability): CapabilitySupport;
}

export type RegistryResult =
  | { ok: true; registry: DefinitionRegistry }
  | { ok: false; diagnostics: readonly RegistryDiagnostic[] };

const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NAMESPACED_ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
const STATUSES: readonly string[] = ["planned", "experimental", "partial", "verified", "unsupported"];

export function isPinnedReference(reference: DefinitionReference): boolean {
  return NAMESPACED_ID.test(reference.id) && EXACT_VERSION.test(reference.version);
}

/** Builds a snapshot of curated typed entries. This is not a plugin-code loader. */
export function createRegistry(entries: readonly RegistryEntry[]): RegistryResult {
  const diagnostics: RegistryDiagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const reference = entry.definition.reference;
    const report = (code: RegistryDiagnostic["code"], message: string) =>
      diagnostics.push({ code, reference, message });
    if (!isPinnedReference(reference)) {
      report("invalid-reference", "Gunakan ID namespaced dan versi tepat; rentang versi tidak diterima.");
    }
    const key = definitionKey(reference);
    if (seen.has(key)) report("duplicate-reference", "Definisi dengan versi sama sudah terdaftar.");
    seen.add(key);
    const analysis = analyzeCircuit({ instances: [], wires: [], junctions: [] }, [entry.definition]);
    if (!analysis.ok) {
      for (const diagnostic of analysis.diagnostics) report("invalid-definition", diagnostic.message);
    }
    for (const [capability, support] of Object.entries(entry.capabilities)) {
      if (
        !(CAPABILITIES as readonly string[]).includes(capability) ||
        !support || !STATUSES.includes(support.status) || !support.note.trim() ||
        !Array.isArray(support.evidence) ||
        support.evidence.some((item: string) => !item.trim()) ||
        (support.status === "verified" && support.evidence.length === 0)
      ) {
        report("invalid-capability", `Metadata dukungan ${capability} tidak valid atau belum memiliki bukti.`);
      }
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  // Copy and freeze nested values: callers cannot mutate a registered definition.
  const snapshots = entries.map((entry): RegistryEntry => {
    const definition = Object.freeze({
      ...entry.definition,
      reference: Object.freeze({ ...entry.definition.reference }),
      terminals: Object.freeze(entry.definition.terminals.map((terminal) => Object.freeze({ ...terminal }))),
      internalConnections: Object.freeze(entry.definition.internalConnections.map((group) => Object.freeze([...group]))),
    });
    const capabilities = Object.freeze(Object.fromEntries(
      Object.entries(entry.capabilities).map(([key, support]) => [key, Object.freeze({
        ...support,
        evidence: Object.freeze([...support!.evidence]),
      })]),
    ));
    return Object.freeze({ definition, capabilities });
  });
  snapshots.sort((a, b) => {
    const first = definitionKey(a.definition.reference);
    const second = definitionKey(b.definition.reference);
    return first < second ? -1 : first > second ? 1 : 0;
  });
  const index = new Map(snapshots.map((entry) => [definitionKey(entry.definition.reference), entry]));

  return {
    ok: true,
    registry: Object.freeze({
      resolve: (reference: DefinitionReference) => index.get(definitionKey(reference)),
      list: (kind?: PartDefinition["kind"]) => Object.freeze(snapshots.filter((entry) => !kind || entry.definition.kind === kind)),
      support: (reference: DefinitionReference, capability: Capability) =>
        index.get(definitionKey(reference))?.capabilities[capability] ?? Object.freeze({
          status: "unsupported" as const,
          note: "Kemampuan ini belum dinyatakan untuk definisi dan versi tersebut.",
          evidence: Object.freeze([]),
        }),
    }),
  };
}
