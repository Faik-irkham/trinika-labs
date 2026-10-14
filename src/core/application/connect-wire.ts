import { analyzeCircuit, type CircuitDiagnostic } from "../domain/circuit";
import {
  type PartDefinition,
  type ProjectDocument,
  type Wire,
} from "../domain/project";

export type ConnectWireResult =
  | { ok: true; project: ProjectDocument }
  | { ok: false; diagnostics: readonly CircuitDiagnostic[] };

/** Atomic document command, shared by 2D and 3D. Input is never mutated. */
export function connectWire(
  project: ProjectDocument,
  wire: Wire,
  definitions: readonly PartDefinition[],
): ConnectWireResult {
  const circuit = {
    ...project.circuit,
    wires: [...project.circuit.wires, wire],
  };
  const analysis = analyzeCircuit(circuit, definitions);
  if (!analysis.ok) return { ok: false, diagnostics: analysis.diagnostics };

  return {
    ok: true,
    project: { ...project, revision: project.revision + 1, circuit },
  };
}
