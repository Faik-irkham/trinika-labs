"use client";

import { useRef, useState, type PointerEvent } from "react";
import { endpointKey } from "../../../core/domain/project";
import { partFor, pointFor, positionFor } from "../viewmodels/projection";
import type { WorkspaceController, WorkspaceSnapshot } from "../viewmodels/workspace-controller";
import { PartSymbol } from "./part-symbol";

type Drag = { id: string; startX: number; startY: number; x: number; y: number; originX: number; originY: number; moved: boolean };
export function CircuitCanvas({ controller, snapshot }: { controller: WorkspaceController; snapshot: WorkspaceSnapshot }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const project = drag ? { ...snapshot.project, presentation: { ...snapshot.project.presentation, wiring2d: { ...snapshot.project.presentation.wiring2d, [drag.id]: { ...positionFor(snapshot.project, snapshot.project.circuit.instances.find((item) => item.id === drag.id)!), x: drag.x, y: drag.y } } } } : snapshot.project;

  const svgPoint = (event: PointerEvent) => {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const startDrag = (event: PointerEvent<SVGGElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const instance = project.circuit.instances.find((item) => item.id === id)!;
    const position = positionFor(project, instance);
    const point = svgPoint(event);
    dragRef.current = { id, startX: point.x, startY: point.y, originX: position.x, originY: position.y, x: position.x, y: position.y, moved: false };
    setDrag(dragRef.current);
    svgRef.current!.setPointerCapture(event.pointerId);
    controller.select({ kind: "instance", id });
  };

  return <div className="canvas-area">
    <div className="canvas-corner">WIRING WORKSPACE <span className="canvas-corner-detail">/ 2D</span></div>
    {project.circuit.instances.length === 0 && <div className="canvas-empty"><h3>Rangkaian masih kosong.</h3><p>Tambahkan komponen dari katalog.</p></div>}
    <svg ref={svgRef} className="circuit-svg" aria-label="Kanvas rangkaian. Pilih komponen atau pin; tombol panah memindahkan komponen." viewBox={`${(1000 - 1000 / zoom) / 2} ${(620 - 620 / zoom) / 2} ${1000 / zoom} ${620 / zoom}`}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        const point = svgPoint(event);
        const initial = dragRef.current;
        const next = { ...initial, x: Math.round((initial.originX + point.x - initial.startX) / 10) * 10, y: Math.round((initial.originY + point.y - initial.startY) / 10) * 10, moved: initial.moved || Math.abs(point.x - initial.startX) + Math.abs(point.y - initial.startY) > 3 };
        dragRef.current = next; setDrag(next);
      }}
      onPointerUp={(event) => {
        const current = dragRef.current;
        dragRef.current = null; setDrag(null);
        if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
        if (current?.moved) controller.movePart(current.id, current.x, current.y);
      }}
      onPointerCancel={() => { dragRef.current = null; setDrag(null); }}>
      {project.circuit.wires.map((wire, index) => {
        const from = pointFor(project, wire.from); const to = pointFor(project, wire.to);
        const middle = (from.x + to.x) / 2;
        const path = to.x >= from.x ? `M${from.x},${from.y} H${middle} V${to.y} H${to.x}` : `M${from.x},${from.y} V${Math.max(from.y, to.y) + 80} H${to.x + 25} V${to.y} H${to.x}`;
        const selected = snapshot.selection?.kind === "wire" && snapshot.selection.id === wire.id;
        return <g key={wire.id} className={`wire-path ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`Pilih kabel ${wire.id}`} onClick={() => controller.select({ kind: "wire", id: wire.id })} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); controller.select({ kind: "wire", id: wire.id }); } }}>
          <title>{`${wire.id}: klik untuk memilih dan menghapus`}</title>
          <path d={path} fill="none" stroke="transparent" strokeWidth="18" />
          <path className="wire-visible" d={path} fill="none" stroke={selected ? "#f1a45a" : ["#58a88b", "#58a88b", "#717e87", "#b5945c"][index % 4]} strokeWidth={selected ? 4 : 3} strokeLinejoin="round" />
        </g>;
      })}
      {project.circuit.junctions.map((junction) => { const point = pointFor(project, { kind: "junction", junctionId: junction.id }); return <circle key={junction.id} cx={point.x} cy={point.y} r="5" fill="#596a5d"><title>{`Junction ${junction.id}`}</title></circle>; })}
      {project.circuit.instances.map((instance) => {
        const part = partFor(instance); const position = positionFor(project, instance);
        const selected = snapshot.selection?.kind === "instance" && snapshot.selection.id === instance.id;
        return <g key={instance.id} transform={`translate(${position.x} ${position.y}) rotate(${position.rotation} ${part.width / 2} ${part.height / 2})`}>
          <g className="part-body" role="button" tabIndex={0} aria-label={`Pilih ${instance.id}, ${part.definition.label}`} onClick={() => controller.select({ kind: "instance", id: instance.id })} onPointerDown={(event) => startDrag(event, instance.id)} onKeyDown={(event) => {
            if (["Enter", " "].includes(event.key)) { event.preventDefault(); controller.select({ kind: "instance", id: instance.id }); }
            const offset: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
            if (offset[event.key]) { event.preventDefault(); controller.movePart(instance.id, position.x + offset[event.key][0], position.y + offset[event.key][1]); }
          }}>
            <rect className={`part-selection ${selected ? "active" : ""}`} x="-13" y="-16" width={part.width + 26} height={part.height + 50} rx="10" fill="transparent" />
            <PartSymbol symbol={part.symbol} color={String(instance.properties.color ?? "green")} resistance={Number(instance.properties.resistance ?? 220)} />
            <text x={part.width / 2} y={part.height + 24} textAnchor="middle" className="part-label">{String(instance.properties.label ?? part.definition.label)} <tspan className="part-id">· {instance.id}</tspan></text>
          </g>
          {part.pins.map((pin) => {
            const endpoint = { kind: "terminal" as const, instanceId: instance.id, terminalId: pin.id };
            const active = snapshot.pendingTerminal && endpointKey(snapshot.pendingTerminal) === endpointKey(endpoint);
            return <circle key={pin.id} className={`terminal ${active ? "active" : ""}`} cx={pin.x} cy={pin.y} r="6" role="button" tabIndex={0} aria-label={`Hubungkan ${instance.id} ${pin.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); controller.chooseTerminal(endpoint); }} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); controller.chooseTerminal(endpoint); } }}><title>{`${instance.id}: ${part.definition.terminals.find((terminal) => terminal.id === pin.id)?.label ?? pin.id}`}</title></circle>;
          })}
        </g>;
      })}
    </svg>
    <div className="canvas-help"><span>↖</span> Geser komponen <i /> Klik dua pin untuk menyambung</div>
    <div className="zoom-controls"><button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(.5, z - .25))}>−</button><button className="zoom-value" aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + .25))}>+</button></div>
  </div>;
}
