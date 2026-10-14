"use client";

import { useRef, useState, type ReactNode } from "react";
import { STARTER_CATALOG, starterRegistry } from "../../../core/catalog/starter-catalog";
import { MAX_PROJECT_JSON_LENGTH } from "../../../core/project-format/project-json";
import { partFor, positionFor } from "../viewmodels/projection";
import { browserProjectStore, useWorkspace } from "../viewmodels/use-workspace";
import { CircuitCanvas } from "./circuit-canvas";
import { PartSymbol } from "./part-symbol";

function Icon({ name, size = 18 }: { name: "grid" | "folder" | "save" | "download" | "undo" | "redo" | "code" | "layers" | "search" | "plus" | "trash" | "book" | "arrow"; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    folder: <path d="M3 7V5h6l2 2h10v13H3Z" />,
    save: <><path d="M4 3h13l4 4v14H4Z" /><path d="M8 3v6h8V3M8 21v-8h9v8" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6" /></>,
    undo: <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v4" />,
    redo: <path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7v4" />,
    code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
    layers: <><path d="m12 3 10 5-10 5L2 8Z M2 12l10 5 10-5M2 16l10 5 10-5" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    book: <><path d="M12 5c-4-3-9-2-9-2v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z M12 5v16" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function EditableField({ label, value, type = "text", onCommit, onDraft, onFinish }: { label: string; value: string | number; type?: "text" | "number"; onCommit: (value: string) => void; onDraft: () => void; onFinish: () => void }) {
  const [draft, setDraft] = useState(String(value));
  return <label className="field"><span>{label}</span><input type={type} value={draft} onChange={(event) => { setDraft(event.target.value); onDraft(); }} onBlur={() => { onCommit(draft); setDraft(String(value)); onFinish(); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function FileEditor({ path, content, commit, markDraft, finishDraft }: { path: string; content: string; commit: (content: string) => void; markDraft: () => void; finishDraft: () => void }) {
  const [draft, setDraft] = useState(content);
  return <div className="code-editor"><div className="code-file"><Icon name="code" size={15} /><span>{path}</span>{draft !== content && <span className="draft-dot" title="Perubahan belum diterapkan" />}</div><div className="editor-content"><div className="line-numbers" aria-hidden="true">{draft.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}</div><textarea aria-label={`Edit file ${path}`} value={draft} spellCheck={false} onChange={(event) => { setDraft(event.target.value); markDraft(); }} onBlur={() => { commit(draft); finishDraft(); }} /></div><div className="editor-footer">Plain text <span>UTF-8 · kode belum dapat dijalankan</span></div></div>;
}

export default function Workspace() {
  const { controller, snapshot } = useWorkspace();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [tab, setTab] = useState<"circuit" | "code">("circuit");
  const [fileIndex, setFileIndex] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<"properties" | "guide">("properties");
  const [isImporting, setIsImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const project = snapshot.project;
  const selected = snapshot.selection?.kind === "instance" ? project.circuit.instances.find((instance) => instance.id === snapshot.selection!.id) : undefined;
  const selectedWire = snapshot.selection?.kind === "wire" ? project.circuit.wires.find((wire) => wire.id === snapshot.selection!.id) : undefined;
  const selectedPart = selected ? partFor(selected) : undefined;
  const visibleParts = STARTER_CATALOG.filter((part) => (category === "Semua" || part.category === category) && `${part.definition.label} ${part.description}`.toLowerCase().includes(search.toLowerCase()));
  const file = project.files[Math.min(fileIndex, project.files.length - 1)];

  const exportProject = () => {
    const json = controller.exportJson();
    if (json === null) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${project.title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "proyek"}.trinika.json`;
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    controller.notify("File JSON diekspor. Simpan file unduhan sebagai cadangan.", "success");
  };

  return <div className="lab-shell" id="workspace">
    <aside className="app-rail"><a href="#workspace" className="brand-mark" aria-label="Trinika Labs">t<span>.</span></a><a href="#workspace" className="rail-button active" aria-label="Workspace"><Icon name="grid" size={21} /></a><button className={`rail-button ${inspectorTab === "guide" ? "active" : ""}`} aria-label="Buka panduan belajar" onClick={() => setInspectorTab("guide")}><Icon name="book" size={21} /></button><div className="rail-bottom"><span className="rail-version">v0.1</span><span className="avatar">TL</span></div></aside>
    <div className="lab-content">
      <header className="app-header"><div className="product-name">trinika<span>labs</span><span className="preview-badge">DRAFT TANPA ARAHAN VISUAL</span></div><div className="header-right"><span className="local-indicator">Lokal di browser</span><span className="open-source-label">OPEN SOURCE</span></div></header>
      <div className="project-toolbar">
        <div className="project-heading">
          <div className="project-icon"><Icon name="layers" size={20} /></div>
          <div>
            <EditableField key={`${project.id}-${project.revision}-title`} label="Nama proyek" value={project.title} onCommit={controller.rename} onDraft={controller.markDraft} onFinish={controller.finishDraft} />
            <p><span className={`save-dot ${snapshot.dirty ? "unsaved" : ""}`} />{snapshot.dirty ? "Perubahan belum disimpan" : "Tersimpan di browser"}<span className="toolbar-separator">/</span>Wiring dasar</p>
          </div>
        </div>
        <div className="project-actions">
          <button className="tool-button icon-only" aria-label="Undo" disabled={!snapshot.undoCount || isImporting} onClick={controller.undo}><Icon name="undo" /></button>
          <button className="tool-button icon-only" aria-label="Redo" disabled={!snapshot.redoCount || isImporting} onClick={controller.redo}><Icon name="redo" /></button>
          <span className="action-divider" />
          <button className="tool-button" aria-label={isImporting ? "Membaca file proyek" : "Buka proyek"} disabled={isImporting} onClick={() => fileInput.current?.click()}><Icon name="folder" /><span>{isImporting ? "Membaca file…" : "Buka"}</span></button>
          <button className="tool-button" aria-label="Ekspor proyek JSON" onClick={exportProject}><Icon name="download" /><span>Ekspor</span></button>
          <button className="primary-button" onClick={() => controller.saveLocal(browserProjectStore)}><Icon name="save" /><span>Simpan lokal</span></button>
        </div>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Buka file proyek JSON" onChange={async (event) => {
        const imported = event.target.files?.[0]; event.target.value = "";
        if (!imported) return;
        if (imported.size > MAX_PROJECT_JSON_LENGTH * 4) return controller.notify("File proyek terlalu besar.", "error");
        setIsImporting(true);
        controller.notify("Membaca file proyek…");
        try { controller.importJson(await imported.text()); setFileIndex(0); }
        catch { controller.notify("File tidak dapat dibaca. Pilih file JSON lain atau gunakan cadangan.", "error"); }
        finally { setIsImporting(false); }
      }} />
      <main className="workspace-grid">
        <aside className="catalog-panel"><div className="panel-heading"><div><span className="eyebrow">TOOLBOX</span><h2>Komponen</h2></div><span className="count-badge">{STARTER_CATALOG.length}</span></div><label className="search-field"><Icon name="search" size={16} /><input placeholder="Cari komponen…" aria-label="Cari komponen" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="category-tabs" aria-label="Kategori komponen">{["Semua", "Board", "Komponen"].map((item) => <button key={item} aria-pressed={category === item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="catalog-list">{visibleParts.map((part) => <button key={part.definition.reference.id} className="catalog-card" onClick={() => controller.addPart(part.definition.reference)} aria-label={`Tambah ${part.definition.label}`}><span className={`catalog-thumbnail ${part.symbol}`}><svg viewBox={`-12 -12 ${part.width + 24} ${part.height + 24}`} aria-hidden="true"><PartSymbol symbol={part.symbol} /></svg></span><span className="catalog-card-info"><strong>{part.definition.label}</strong><span>{part.category === "Board" ? "Board generik" : part.symbol === "resistor" ? "220 Ω · dua terminal" : part.symbol === "led" ? "Output · dua terminal" : part.symbol === "button" ? "Input · dua terminal" : "5 kontak terhubung"}</span></span><span className="add-part"><Icon name="plus" size={15} /></span></button>)}{visibleParts.length === 0 && <p className="empty-message">Komponen tidak ditemukan. Coba kata lain.</p>}</div><div className="project-parts"><h3>Di rangkaian <span>{project.circuit.instances.length}</span></h3><div>{project.circuit.instances.map((instance) => <button key={instance.id} className={snapshot.selection?.id === instance.id ? "active" : ""} onClick={() => { controller.select({ kind: "instance", id: instance.id }); setInspectorTab("properties"); }}><span className="instance-marker" /><span>{String(instance.properties.label ?? partFor(instance).definition.label)}</span><code>{instance.id}</code></button>)}</div></div><div className="catalog-note"><span className="mini-icon"><Icon name="layers" size={17} /></span><strong>Dibangun untuk banyak board.</strong><p>Katalog awal memakai simbol generik. ESP, AVR, dan keluarga lain akan hadir melalui adapter terverifikasi.</p></div></aside>
        <section className="workspace-center" aria-label="Editor proyek"><div className="workspace-tabs"><div className="editor-tabs"><button className={tab === "circuit" ? "active" : ""} aria-pressed={tab === "circuit"} onClick={() => setTab("circuit")}><Icon name="layers" size={16} />Rangkaian</button><button className={tab === "code" ? "active" : ""} aria-pressed={tab === "code"} onClick={() => setTab("code")}><Icon name="code" size={16} />File kode</button></div><div className="view-switch"><span className="active">2D</span><span title="Renderer 3D belum tersedia">3D <small>segera</small></span></div></div>
          {tab === "circuit" ? <CircuitCanvas controller={controller} snapshot={snapshot} /> : <div className="code-workspace"><div className="file-tabs">{project.files.map((item, index) => <button key={item.path} className={file === item ? "active" : ""} onClick={() => setFileIndex(index)}>{item.path}</button>)}</div>{file ? <FileEditor key={`${project.id}-${project.revision}-${file.path}`} path={file.path} content={file.content} commit={(content) => controller.updateFile(file.path, content)} markDraft={controller.markDraft} finishDraft={controller.finishDraft} /> : <div className="canvas-empty"><h3>Belum ada file kode.</h3><p>Proyek ini dapat digunakan untuk latihan wiring.</p></div>}</div>}
          <div className="connection-panel"><div className="connection-header"><h3>Sambungan <span>{project.circuit.wires.length}</span></h3><span className="structural-badge">✓ Topologi tervalidasi</span></div><div className="connection-list">{project.circuit.wires.length === 0 ? <p>Belum ada kabel. Pilih dua pin untuk menghubungkan.</p> : project.circuit.wires.map((wire) => <button key={wire.id} className={snapshot.selection?.id === wire.id ? "active" : ""} onClick={() => { controller.select({ kind: "wire", id: wire.id }); setInspectorTab("properties"); }}><span className="connection-dot" /><span>{wire.from.kind === "terminal" ? `${wire.from.instanceId}.${wire.from.terminalId}` : wire.from.junctionId}</span><Icon name="arrow" size={13} /><span>{wire.to.kind === "terminal" ? `${wire.to.instanceId}.${wire.to.terminalId}` : wire.to.junctionId}</span></button>)}</div></div>
        </section>
        <aside className="inspector-panel"><div className="inspector-tabs"><button className={inspectorTab === "properties" ? "active" : ""} onClick={() => setInspectorTab("properties")}>Properti</button><button className={inspectorTab === "guide" ? "active" : ""} onClick={() => setInspectorTab("guide")}>Panduan</button></div>
          {inspectorTab === "guide" ? <div className="guide-panel" id="guide"><span className="eyebrow">MULAI DARI SINI</span><h2>Kenali rangkaian<br />pertamamu.</h2><p>Belajar sambungan sebelum menjalankan perangkat.</p><ol><li><strong>Pilih komponen</strong><p>Klik katalog untuk menambahkan. Geser di kanvas atau ubah posisi pada panel properti.</p></li><li><strong>Hubungkan pin</strong><p>Klik pin awal, lalu pin tujuan. Escape membatalkan pilihan.</p></li><li><strong>Amati topologi</strong><p>Baris breadboard menggabungkan lima terminal. Resistor dan LED tetap memiliki dua terminal terpisah.</p></li><li><strong>Simpan eksperimen</strong><p>Simpan lokal untuk melanjutkan di browser ini. Ekspor JSON untuk cadangan atau berbagi file.</p></li></ol><div className="support-note">Validasi saat ini memeriksa koneksi dan referensi. Tegangan, arus, serta kode firmware belum disimulasikan.</div></div> : <>
            <div className="inspector-content">{selected && selectedPart ? <>
              <span className="eyebrow">KOMPONEN TERPILIH</span><div className="selected-heading"><h2>{selectedPart.definition.label}</h2><span className="experimental-badge">Generik</span></div><code className="instance-code">{selected.id}</code><p className="part-description">{selectedPart.description}</p>
              <div className="property-section"><h3>Pengaturan</h3><EditableField key={`${selected.id}-${project.revision}-label`} label="Label komponen" value={String(selected.properties.label ?? selectedPart.definition.label)} onCommit={(value) => controller.updateProperty(selected.id, "label", value)} onDraft={controller.markDraft} onFinish={controller.finishDraft} />
                {selectedPart.symbol === "led" && <label className="field"><span>Warna LED</span><select value={String(selected.properties.color ?? "green")} onChange={(event) => controller.updateProperty(selected.id, "color", event.target.value)}><option value="green">Hijau</option><option value="red">Merah</option><option value="blue">Biru</option><option value="amber">Kuning</option></select></label>}
                {selectedPart.symbol === "resistor" && <EditableField key={`${selected.id}-${project.revision}-resistance`} label="Resistansi (Ω)" type="number" value={Number(selected.properties.resistance ?? 220)} onCommit={(value) => controller.updateProperty(selected.id, "resistance", Number(value))} onDraft={controller.markDraft} onFinish={controller.finishDraft} />}
                <div className="position-fields">{["x", "y"].map((axis) => <EditableField key={`${selected.id}-${project.revision}-${axis}`} label={`Posisi ${axis.toUpperCase()}`} type="number" value={positionFor(project, selected)[axis as "x" | "y"]} onCommit={(value) => { const pos = positionFor(project, selected); controller.movePart(selected.id, axis === "x" ? Number(value) : pos.x, axis === "y" ? Number(value) : pos.y); }} onDraft={controller.markDraft} onFinish={controller.finishDraft} />)}</div>
              </div><div className="property-section"><h3>Terminal <span>{selectedPart.definition.terminals.length}</span></h3><div className="pin-list">{selectedPart.definition.terminals.map((pin) => <button key={pin.id} onClick={() => controller.chooseTerminal({ kind: "terminal", instanceId: selected.id, terminalId: pin.id })}><span className="pin-indicator" /><strong>{pin.label}</strong><span>{pin.kind}</span></button>)}</div></div>
              <div className="property-section"><h3>Dukungan versi ini</h3><div className="support-row"><span>Wiring 2D</span><span className="status-experimental">Eksperimental</span></div><div className="support-row"><span>Model 3D</span><span>Direncanakan</span></div><div className="support-row"><span>Simulasi / upload</span><span>{starterRegistry.support(selected.definition, "simulate.gpio").status === "unsupported" ? "Belum tersedia" : "Lihat registry"}</span></div><code className="definition-code">{selected.definition.id}@{selected.definition.version}</code></div>
              <button className="delete-button" onClick={controller.removeSelected}><Icon name="trash" size={15} />Hapus komponen</button>
            </> : selectedWire ? <><span className="eyebrow">KABEL TERPILIH</span><h2>{selectedWire.id}</h2><p className="part-description">Menghapus kabel akan menghitung ulang sambungan. Komponen tetap berada di proyek.</p><button className="delete-button" onClick={controller.removeSelected}><Icon name="trash" size={15} />Hapus kabel</button></> : <div className="inspector-empty"><div className="empty-icon"><Icon name="layers" size={26} /></div><h3>Setiap bagian punya cerita.</h3><p>Pilih komponen untuk melihat pin, mengubah properti, atau memindahkannya.</p><button className="text-button" onClick={() => setInspectorTab("guide")}>Buka panduan <Icon name="arrow" size={15} /></button></div>}</div>
            <div className="lab-note"><span className="eyebrow">CATATAN LAB</span><h3>Wiring dulu.<br />Eksperimen menyusul.</h3><p>Editor ini menyimpan rangkaian dan kode. Compiler serta emulator akan ditambahkan melalui adapter.</p></div>
          </>}
        </aside>
      </main>
      <footer className="status-bar"><div role="status" aria-live="polite" className={`status-message ${snapshot.notice.tone}`}><span className="status-symbol">{snapshot.notice.tone === "error" ? "!" : snapshot.notice.tone === "success" ? "✓" : "○"}</span>{snapshot.notice.text}</div><div className="status-details"><span>{project.circuit.instances.length} komponen</span><span>{snapshot.netCount} net</span><span>rev {project.revision}</span></div></footer>
    </div>
  </div>;
}
