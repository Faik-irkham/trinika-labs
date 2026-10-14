import { createRegistry, type RegistryEntry } from "../domain/registry";
import { createProject, type DefinitionReference, type ProjectDocument } from "../domain/project";

export type PartSymbol = "board" | "led" | "resistor" | "button" | "breadboard";
export interface CatalogPart extends RegistryEntry {
  symbol: PartSymbol;
  description: string;
  category: "Board" | "Komponen";
  defaults: Readonly<Record<string, string | number | boolean>>;
  width: number;
  height: number;
  pins: readonly { id: string; x: number; y: number }[];
}

const reference = (name: string): DefinitionReference => ({ id: `core:${name}`, version: "1.0.0" });
const visualSupport = {
  visual2d: { status: "experimental" as const, note: "Simbol generik untuk latihan wiring 2D.", evidence: [] },
  visual3d: { status: "planned" as const, note: "Model 3D belum tersedia.", evidence: [] },
};

/** Generic educational symbols. No physical MCU pinout or firmware support claims. */
export const STARTER_CATALOG: readonly CatalogPart[] = [
  {
    definition: {
      reference: reference("training-board"), kind: "board", label: "Papan latihan",
      terminals: [
        { id: "vcc", label: "VCC", kind: "power" },
        { id: "gnd", label: "GND", kind: "ground" },
        { id: "io-1", label: "IO1", kind: "digital" },
        { id: "io-2", label: "IO2", kind: "digital" },
      ], internalConnections: [],
    },
    capabilities: visualSupport, symbol: "board", category: "Board",
    description: "Board generik untuk belajar sambungan. Bukan model ESP atau Arduino.",
    defaults: {}, width: 172, height: 164,
    pins: [{ id: "vcc", x: 172, y: 32 }, { id: "gnd", x: 172, y: 132 }, { id: "io-1", x: 172, y: 64 }, { id: "io-2", x: 172, y: 98 }],
  },
  {
    definition: {
      reference: reference("led"), kind: "component", label: "LED",
      terminals: [{ id: "anode", label: "Anoda (+)", kind: "passive" }, { id: "cathode", label: "Katoda (−)", kind: "passive" }],
      internalConnections: [],
    },
    capabilities: visualSupport, symbol: "led", category: "Komponen",
    description: "Kenali polaritas anoda dan katoda. Perilaku listrik belum disimulasikan.",
    defaults: { color: "green" }, width: 100, height: 130,
    pins: [{ id: "anode", x: 26, y: 130 }, { id: "cathode", x: 74, y: 130 }],
  },
  {
    definition: {
      reference: reference("resistor"), kind: "component", label: "Resistor",
      terminals: [{ id: "a", label: "A", kind: "passive" }, { id: "b", label: "B", kind: "passive" }],
      internalConnections: [],
    },
    capabilities: visualSupport, symbol: "resistor", category: "Komponen",
    description: "Komponen dua terminal. Nilai resistansi disimpan sebagai properti proyek.",
    defaults: { resistance: 220 }, width: 156, height: 64,
    pins: [{ id: "a", x: 0, y: 32 }, { id: "b", x: 156, y: 32 }],
  },
  {
    definition: {
      reference: reference("button"), kind: "component", label: "Tombol",
      terminals: [{ id: "a", label: "A", kind: "passive" }, { id: "b", label: "B", kind: "passive" }],
      internalConnections: [],
    },
    capabilities: visualSupport, symbol: "button", category: "Komponen",
    description: "Simbol tombol dua terminal. Keadaan terbuka/tertutup menunggu runtime.",
    defaults: {}, width: 110, height: 92,
    pins: [{ id: "a", x: 0, y: 46 }, { id: "b", x: 110, y: 46 }],
  },
  {
    definition: {
      reference: reference("breadboard-row"), kind: "component", label: "Baris breadboard",
      terminals: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id.toUpperCase(), kind: "passive" as const })),
      internalConnections: [["a", "b", "c", "d", "e"]],
    },
    capabilities: visualSupport, symbol: "breadboard", category: "Komponen",
    description: "Satu baris lima kontak yang saling terhubung; bukan breadboard penuh.",
    defaults: {}, width: 186, height: 86,
    pins: ["a", "b", "c", "d", "e"].map((id, index) => ({ id, x: 25 + index * 34, y: 43 })),
  },
];

const registryResult = createRegistry(STARTER_CATALOG);
if (!registryResult.ok) throw new Error("Starter catalog is invalid.");
export const starterRegistry = registryResult.registry;

export function createStarterProject(): ProjectDocument {
  const project = createProject("wiring-starter", "Rangkaian pertamaku");
  const definitions = ["training-board", "resistor", "led", "button"];
  const ids = ["board-1", "resistor-1", "led-1", "button-1"];
  const positions = [{ x: 95, y: 140 }, { x: 370, y: 174 }, { x: 655, y: 130 }, { x: 455, y: 375 }];
  return {
    ...project,
    files: [{ path: "main.cpp", content: "// Trinika Labs: latihan wiring\n// Papan latihan ini belum memiliki compiler atau emulator.\n// Kode disimpan sebagai file proyek; belum dapat dijalankan.\n\nvoid setup() {\n  // Konfigurasi pin mengikuti board nyata yang akan dipilih nanti.\n}\n\nvoid loop() {\n  // Tulis eksperimenmu di sini.\n}\n" }],
    dependencies: definitions.map(reference),
    circuit: {
      instances: definitions.map((name, index) => ({
        id: ids[index], definition: reference(name),
        properties: { ...STARTER_CATALOG.find((part) => part.definition.reference.id === `core:${name}`)!.defaults },
      })),
      junctions: [],
      wires: [
        { id: "wire-1", from: { kind: "terminal", instanceId: "board-1", terminalId: "io-1" }, to: { kind: "terminal", instanceId: "resistor-1", terminalId: "a" } },
        { id: "wire-2", from: { kind: "terminal", instanceId: "resistor-1", terminalId: "b" }, to: { kind: "terminal", instanceId: "led-1", terminalId: "anode" } },
        { id: "wire-3", from: { kind: "terminal", instanceId: "led-1", terminalId: "cathode" }, to: { kind: "terminal", instanceId: "board-1", terminalId: "gnd" } },
      ],
    },
    presentation: {
      ...project.presentation,
      wiring2d: Object.fromEntries(ids.map((id, index) => [id, { ...positions[index], rotation: 0 }])),
    },
  };
}
