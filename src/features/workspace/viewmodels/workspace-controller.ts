import { connectWire } from "../../../core/application/connect-wire";
import { STARTER_CATALOG, createStarterProject, starterRegistry } from "../../../core/catalog/starter-catalog";
import { analyzeCircuit } from "../../../core/domain/circuit";
import { definitionKey, endpointKey, type DefinitionReference, type ProjectDocument, type TerminalEndpoint } from "../../../core/domain/project";
import { parseProjectJson, serializeProjectJson } from "../../../core/project-format/project-json";

export interface LocalProjectStore {
  read(): string | null;
  write(json: string): void;
}

export type Selection = { kind: "instance" | "wire"; id: string } | null;
export interface WorkspaceSnapshot {
  project: ProjectDocument;
  selection: Selection;
  pendingTerminal: TerminalEndpoint | null;
  notice: { tone: "info" | "success" | "error"; text: string };
  dirty: boolean;
  undoCount: number;
  redoCount: number;
  netCount: number;
}

/** ViewModel controller: pure TypeScript, usable without React or browser APIs. */
export class WorkspaceController {
  private listeners = new Set<() => void>();
  private undoStack: ProjectDocument[] = [];
  private redoStack: ProjectDocument[] = [];
  private initialized = false;
  private savedJson: string | null = null;
  private state: WorkspaceSnapshot;

  constructor() {
    const project = createStarterProject();
    this.state = {
      project, selection: null, pendingTerminal: null, dirty: true,
      undoCount: 0, redoCount: 0, netCount: this.countNets(project),
      notice: { tone: "info", text: "Klik dua pin untuk menambahkan kabel. Sambungan ini belum menjalankan simulasi." },
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private countNets(project: ProjectDocument) {
    const analysis = analyzeCircuit(project.circuit, starterRegistry.list().map((entry) => entry.definition));
    return analysis.ok ? analysis.nets.length : 0;
  }

  private publish(patch: Partial<WorkspaceSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  notify = (text: string, tone: WorkspaceSnapshot["notice"]["tone"] = "info") => {
    this.publish({ notice: { text, tone } });
  };

  markDraft = () => { if (!this.state.dirty) this.publish({ dirty: true }); };
  finishDraft = () => this.publish({ dirty: JSON.stringify(this.state.project) !== this.savedJson });

  private apply(project: ProjectDocument, message: string, preserveRevision = false): boolean {
    const candidate = preserveRevision ? project : { ...project, revision: this.state.project.revision + 1 };
    const result = serializeProjectJson(candidate, starterRegistry);
    if (!result.ok) {
      this.notify(result.diagnostics[0].message, "error");
      return false;
    }
    this.undoStack = [...this.undoStack, this.state.project].slice(-50);
    this.redoStack = [];
    this.publish({
      project: candidate, selection: null, pendingTerminal: null,
      dirty: result.json !== this.savedJson,
      undoCount: this.undoStack.length, redoCount: 0,
      netCount: this.countNets(candidate), notice: { tone: "success", text: message },
    });
    return true;
  }

  select = (selection: Selection) => this.publish({ selection });
  cancelConnection = () => this.publish({ pendingTerminal: null });

  addPart = (reference: DefinitionReference) => {
    const part = STARTER_CATALOG.find((item) => definitionKey(item.definition.reference) === definitionKey(reference));
    if (!part) return this.notify("Definisi komponen tidak tersedia.", "error");
    const project = this.state.project;
    const used = new Set([...project.circuit.instances, ...project.circuit.wires, ...project.circuit.junctions].map((item) => item.id));
    let index = 1;
    while (used.has(`${part.symbol}-${index}`)) index++;
    const id = `${part.symbol}-${index}`;
    const position = { x: 120 + (project.circuit.instances.length % 4) * 195, y: 100 + (Math.floor(project.circuit.instances.length / 4) % 3) * 170, rotation: 0 };
    const dependencies = project.dependencies.some((item) => definitionKey(item) === definitionKey(reference))
      ? project.dependencies : [...project.dependencies, { ...reference }];
    if (this.apply({
      ...project, dependencies,
      circuit: { ...project.circuit, instances: [...project.circuit.instances, { id, definition: { ...reference }, properties: { ...part.defaults } }] },
      presentation: { ...project.presentation, wiring2d: { ...project.presentation.wiring2d, [id]: position } },
    }, `${part.definition.label} ditambahkan.`)) this.select({ kind: "instance", id });
  };

  chooseTerminal = (endpoint: TerminalEndpoint) => {
    const project = this.state.project;
    const instance = project.circuit.instances.find((item) => item.id === endpoint.instanceId);
    if (!instance || !starterRegistry.resolve(instance.definition)?.definition.terminals.some((pin) => pin.id === endpoint.terminalId)) {
      return this.notify("Terminal tidak tersedia.", "error");
    }
    const first = this.state.pendingTerminal;
    if (!first) {
      this.publish({ pendingTerminal: { ...endpoint }, notice: { tone: "info", text: `Pin ${endpoint.terminalId} dipilih. Pilih pin tujuan, atau tekan Escape untuk batal.` } });
      return;
    }
    if (endpointKey(first) === endpointKey(endpoint)) return this.cancelConnection();
    if (project.circuit.wires.some((wire) =>
      (endpointKey(wire.from) === endpointKey(first) && endpointKey(wire.to) === endpointKey(endpoint)) ||
      (endpointKey(wire.to) === endpointKey(first) && endpointKey(wire.from) === endpointKey(endpoint)))) {
      return this.notify("Kedua pin sudah dihubungkan oleh kabel.", "error");
    }
    const used = new Set([...project.circuit.instances, ...project.circuit.wires, ...project.circuit.junctions].map((item) => item.id));
    let index = 1;
    while (used.has(`wire-${index}`)) index++;
    const result = connectWire(project, { id: `wire-${index}`, from: { ...first }, to: { ...endpoint } }, starterRegistry.list().map((entry) => entry.definition));
    if (!result.ok) return this.notify(result.diagnostics[0].message, "error");
    this.apply(result.project, "Kabel ditambahkan. Topologi rangkaian diperbarui.");
  };

  movePart = (id: string, x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !this.state.project.circuit.instances.some((item) => item.id === id)) {
      return this.notify("Posisi komponen tidak valid.", "error");
    }
    const project = this.state.project;
    const current = project.presentation.wiring2d[id] ?? { x: 100, y: 100, rotation: 0 };
    if (current.x === x && current.y === y) return;
    if (this.apply({ ...project, presentation: { ...project.presentation, wiring2d: { ...project.presentation.wiring2d, [id]: { ...current, x, y } } } }, "Posisi komponen diperbarui.")) {
      this.select({ kind: "instance", id });
    }
  };

  updateProperty = (id: string, key: "label" | "color" | "resistance", value: string | number) => {
    const project = this.state.project;
    const instance = project.circuit.instances.find((item) => item.id === id);
    if (!instance) return;
    const symbol = STARTER_CATALOG.find((part) => definitionKey(part.definition.reference) === definitionKey(instance.definition))?.symbol;
    if ((key === "label" && (typeof value !== "string" || !value.trim() || value.length > 80)) ||
      (key === "color" && (symbol !== "led" || !["green", "red", "blue", "amber"].includes(String(value)))) ||
      (key === "resistance" && (symbol !== "resistor" || typeof value !== "number" || !Number.isFinite(value) || value <= 0))) {
      return this.notify("Nilai properti tidak valid.", "error");
    }
    if (instance.properties[key] === value) return;
    if (this.apply({ ...project, circuit: { ...project.circuit, instances: project.circuit.instances.map((item) => item.id === id ? { ...item, properties: { ...item.properties, [key]: value } } : item) } }, "Properti komponen diperbarui.")) this.select({ kind: "instance", id });
  };

  rename = (title: string) => {
    if (title === this.state.project.title) return;
    this.apply({ ...this.state.project, title }, "Nama proyek diperbarui.");
  };

  updateFile = (path: string, content: string) => {
    const project = this.state.project;
    if (!project.files.some((file) => file.path === path && file.content !== content)) return;
    this.apply({ ...project, files: project.files.map((file) => file.path === path ? { ...file, content } : file) }, "File proyek diperbarui.");
  };

  removeSelected = () => {
    const selected = this.state.selection;
    if (!selected) return;
    const project = this.state.project;
    if (selected.kind === "wire") {
      this.apply({ ...project, circuit: { ...project.circuit, wires: project.circuit.wires.filter((wire) => wire.id !== selected.id) } }, "Kabel dihapus.");
      return;
    }
    const withoutSelected = <T,>(layout: Readonly<Record<string, T>>) =>
      Object.fromEntries(Object.entries(layout).filter(([id]) => id !== selected.id));
    const layouts = {
      wiring2d: withoutSelected(project.presentation.wiring2d),
      schematic: withoutSelected(project.presentation.schematic),
      scene3d: withoutSelected(project.presentation.scene3d),
    };
    this.apply({
      ...project, presentation: layouts,
      targets: project.targets.filter((target) => target.boardInstanceId !== selected.id),
      circuit: {
        ...project.circuit, instances: project.circuit.instances.filter((item) => item.id !== selected.id),
        wires: project.circuit.wires.filter((wire) => ![wire.from, wire.to].some((endpoint) => endpoint.kind === "terminal" && endpoint.instanceId === selected.id)),
      },
    }, "Komponen dan kabel terkait dihapus.");
  };

  private restoreHistory(project: ProjectDocument, message: string) {
    this.publish({ project, selection: null, pendingTerminal: null,
      undoCount: this.undoStack.length, redoCount: this.redoStack.length,
      dirty: JSON.stringify(project) !== this.savedJson, netCount: this.countNets(project),
      notice: { tone: "info", text: message },
    });
  }

  undo = () => {
    const project = this.undoStack.pop();
    if (!project) return;
    this.redoStack.push(this.state.project);
    this.restoreHistory(project, "Perubahan dibatalkan.");
  };
  redo = () => {
    const project = this.redoStack.pop();
    if (!project) return;
    this.undoStack.push(this.state.project);
    this.restoreHistory(project, "Perubahan diterapkan kembali.");
  };

  importJson = (json: string) => {
    const result = parseProjectJson(json, starterRegistry);
    if (!result.ok) return this.notify(`${result.diagnostics[0].path}: ${result.diagnostics[0].message}`, "error");
    this.apply(result.project, "Proyek dibuka. Gunakan Undo untuk kembali ke proyek sebelumnya.", true);
  };
  exportJson = (): string | null => {
    const result = serializeProjectJson(this.state.project, starterRegistry);
    if (!result.ok) { this.notify(result.diagnostics[0].message, "error"); return null; }
    return result.json;
  };

  initializeLocal = (store: LocalProjectStore) => {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const json = store.read();
      if (json === null) return;
      const result = parseProjectJson(json, starterRegistry);
      if (!result.ok) return this.notify("Simpanan lokal tidak valid. Data asli tetap disimpan; buka file cadangan atau simpan proyek baru secara manual.", "error");
      this.savedJson = JSON.stringify(result.project);
      this.publish({ project: result.project, dirty: false, netCount: this.countNets(result.project), notice: { tone: "success", text: "Proyek lokal dipulihkan." } });
    } catch { this.notify("Penyimpanan browser tidak tersedia. Gunakan Ekspor JSON untuk menyimpan proyek.", "error"); }
  };
  saveLocal = (store: LocalProjectStore) => {
    const json = this.exportJson();
    if (json === null) return;
    try {
      store.write(json);
      this.savedJson = json;
      this.publish({ dirty: false, notice: { tone: "success", text: "Proyek disimpan di browser ini. Ekspor JSON untuk membuat cadangan." } });
    } catch { this.notify("Gagal menyimpan di browser. Gunakan Ekspor JSON agar perubahan tetap tersimpan.", "error"); }
  };
}
