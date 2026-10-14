import { STARTER_CATALOG } from "../../../core/catalog/starter-catalog";
import { definitionKey, type CircuitEndpoint, type PartInstance, type ProjectDocument } from "../../../core/domain/project";

export function partFor(instance: PartInstance) {
  return STARTER_CATALOG.find((part) => definitionKey(part.definition.reference) === definitionKey(instance.definition))!;
}

export function positionFor(project: ProjectDocument, instance: PartInstance) {
  const index = project.circuit.instances.findIndex((item) => item.id === instance.id);
  return project.presentation.wiring2d[instance.id] ?? { x: 90 + (index % 4) * 210, y: 100 + Math.floor(index / 4) * 180, rotation: 0 };
}

export function pointFor(project: ProjectDocument, endpoint: CircuitEndpoint): { x: number; y: number } {
  if (endpoint.kind === "junction") {
    const neighbors = project.circuit.wires.flatMap((wire) => {
      if (wire.from.kind === "junction" && wire.from.junctionId === endpoint.junctionId && wire.to.kind === "terminal") return [pointFor(project, wire.to)];
      if (wire.to.kind === "junction" && wire.to.junctionId === endpoint.junctionId && wire.from.kind === "terminal") return [pointFor(project, wire.from)];
      return [];
    });
    return neighbors.length ? { x: neighbors.reduce((sum, p) => sum + p.x, 0) / neighbors.length, y: neighbors.reduce((sum, p) => sum + p.y, 0) / neighbors.length } : { x: 500, y: 320 };
  }
  const instance = project.circuit.instances.find((item) => item.id === endpoint.instanceId)!;
  const part = partFor(instance);
  const pin = part.pins.find((item) => item.id === endpoint.terminalId)!;
  const position = positionFor(project, instance);
  const angle = position.rotation * Math.PI / 180;
  const dx = pin.x - part.width / 2;
  const dy = pin.y - part.height / 2;
  return { x: position.x + part.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), y: position.y + part.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
