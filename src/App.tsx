import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Download, Minus, Plus, RotateCcw, Save, Trash2, Type } from "lucide-react";
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, FIELD_BY_ID, FIELD_DEFINITIONS, FieldDefinition, productFieldId } from "./fieldConfig";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const PDF_URL = "/pedido-plasnorte.pdf";
const STORAGE_KEY = "plasnorte-edicao";
type Values = Record<string, string>;
type FieldStyle = { fontSize?: number; color?: string };
type FieldStyles = Record<string, FieldStyle>;

function parseNumberBR(value: string) {
  const clean = value.replace(/R\$|\s/g, "");
  if (!/^-?[\d.]+(?:,\d+)?$/.test(clean)) return null;
  const parsed = Number(clean.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function formatNumberBR(value: string) {
  const parsed = parseNumberBR(value);
  if (parsed === null) return value;
  const fraction = value.includes(",") ? value.split(",")[1].length : 0;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(parsed);
}
function formatCurrency(value: number) {
  return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}
function fittedFontSize(field: FieldDefinition, value: string, override?: number) {
  const preferred = override ?? field.fontSize;
  if (!value) return preferred;
  const approximateWidth = value.length * preferred * 0.56;
  return Math.max(12, Math.min(preferred, preferred * ((field.width - 12) / approximateWidth)));
}
function migrateLegacyBoxes(boxes: Array<{ text?: string; x?: number; y?: number }>) {
  const migrated: Values = {};
  for (const box of boxes) {
    if (!box.text || box.x === undefined || box.y === undefined) continue;
    const px = (box.x / 100) * DOCUMENT_WIDTH, py = (box.y / 100) * DOCUMENT_HEIGHT;
    const field = FIELD_DEFINITIONS.find((item) => px >= item.x && px <= item.x + item.width && py >= item.y && py <= item.y + item.height);
    if (field && !migrated[field.id]) migrated[field.id] = box.text;
  }
  return migrated;
}

export default function App() {
  const [values, setValues] = useState<Values>({});
  const [styles, setStyles] = useState<FieldStyles>({});
  const [manualTotals, setManualTotals] = useState<Set<number>>(new Set());
  const [manualGeneral, setManualGeneral] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2300); };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const draft = JSON.parse(saved);
      if (Array.isArray(draft)) setValues(migrateLegacyBoxes(draft));
      else {
        setValues(draft.values ?? {});
        setStyles(draft.styles ?? {});
        setManualTotals(new Set(draft.manualTotals ?? []));
        setManualGeneral(Boolean(draft.manualGeneral));
      }
    } catch { notify("O rascunho anterior não pôde ser carregado."); }
  }, []);

  useEffect(() => {
    (async () => {
      const bytes = await fetch(PDF_URL).then((response) => response.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const page = await doc.getPage(1), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 850 / base.width, rotation: page.rotate });
      const canvas = canvasRef.current!, ratio = devicePixelRatio || 1;
      canvas.width = viewport.width * ratio; canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined, background: "#ffffff" }).promise;
    })().catch(() => notify("Não foi possível abrir o PDF."));
  }, []);

  const updateGrandTotal = (next: Values) => {
    if (manualGeneral) return next;
    let sum = 0;
    for (let row = 0; row < 36; row++) {
      const total = parseNumberBR(next[productFieldId(row, "valorTotal")] ?? "");
      if (total !== null) sum += total;
    }
    return { ...next, totalGeral: sum ? formatCurrency(sum) : "" };
  };

  const changeValue = (field: FieldDefinition, value: string) => {
    if (field.type !== "text" && !/^[\s\d.,R$+\-]*$/.test(value)) return;
    if (field.column === "valorTotal" && field.row !== undefined) {
      setManualTotals((current) => { const next = new Set(current); value ? next.add(field.row!) : next.delete(field.row!); return next; });
    }
    if (field.id === "totalGeral") setManualGeneral(Boolean(value));
    setValues((current) => {
      let next = { ...current, [field.id]: value };
      if (field.row !== undefined && (field.column === "quantidade" || field.column === "valorUnitario") && !manualTotals.has(field.row)) {
        const quantity = parseNumberBR(next[productFieldId(field.row, "quantidade")] ?? "");
        const unit = parseNumberBR(next[productFieldId(field.row, "valorUnitario")] ?? "");
        next[productFieldId(field.row, "valorTotal")] = quantity !== null && unit !== null ? formatCurrency(quantity * unit) : "";
      }
      return field.id === "totalGeral" ? next : updateGrandTotal(next);
    });
  };
  const blurField = (field: FieldDefinition) => {
    const value = values[field.id];
    if (!value || field.type === "text") return;
    const parsed = parseNumberBR(value);
    if (parsed === null) return;
    setValues((current) => updateGrandTotal({ ...current, [field.id]: field.type === "currency" ? formatCurrency(parsed) : formatNumberBR(value) }));
  };
  const saveDraft = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, values, styles, manualTotals: [...manualTotals], manualGeneral }));
    notify("Edição salva neste navegador!");
  };
  const clearAll = () => {
    if (!confirm("Remover todos os dados preenchidos?")) return;
    setValues({}); setStyles({}); setManualTotals(new Set()); setManualGeneral(false); setSelected(null);
  };

  const download = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    try {
      const flattened = document.createElement("canvas");
      flattened.width = canvas.width; flattened.height = canvas.height;
      const context = flattened.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      const sx = flattened.width / DOCUMENT_WIDTH, sy = flattened.height / DOCUMENT_HEIGHT;
      for (const field of FIELD_DEFINITIONS) {
        const value = values[field.id]?.trim(); if (!value) continue;
        const fontSize = fittedFontSize(field, value, styles[field.id]?.fontSize);
        context.font = `${fontSize * sx}px Arial, sans-serif`; context.fillStyle = styles[field.id]?.color ?? "#214b94";
        context.textBaseline = "middle"; context.textAlign = field.align;
        const x = field.align === "right" ? (field.x + field.width - 5) * sx : field.align === "center" ? (field.x + field.width / 2) * sx : (field.x + 5) * sx;
        context.fillText(value, x, (field.y + field.height / 2) * sy, (field.width - 10) * sx);
      }
      const output = await PDFDocument.create(), image = await output.embedPng(flattened.toDataURL("image/png"));
      const page = output.addPage([606, 840]); page.drawImage(image, { x: 0, y: 0, width: 606, height: 840 });
      const data = await output.save(), url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/pdf" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "PEDIDO-PLASNORTE-PREENCHIDO.pdf"; anchor.click(); URL.revokeObjectURL(url);
      notify("PDF exportado com todos os campos!");
    } catch { notify("Não foi possível salvar o PDF."); }
  };

  const active = selected ? FIELD_BY_ID.get(selected) : undefined;
  const activeStyle = active ? styles[active.id] ?? {} : {};
  const renderedFields = useMemo(() => FIELD_DEFINITIONS, []);
  return (
    <main>
      <header>
        <div className="brand"><div className="mark">PN</div><div><b>PLASNORTE</b><span>Preenchimento de pedido</span></div></div>
        <div className="hint"><Type /> Clique em um campo e comece a digitar</div>
        <div className="actions"><button onClick={clearAll}><RotateCcw /> Limpar</button><button onClick={saveDraft}><Save /> Salvar</button><button className="download" onClick={download}><Download /> Exportar PDF</button></div>
      </header>
      <section className="workspace">
        <div className="guide"><b>Como editar</b><span>1. Clique no campo &nbsp; 2. Digite &nbsp; 3. Salve ou exporte</span></div>
        <div className="paper-shell"><div className="paper fixed-form"><canvas ref={canvasRef} /><div className="field-layer">
          {renderedFields.map((field) => {
            const value = values[field.id] ?? "";
            const fontSize = fittedFontSize(field, value, styles[field.id]?.fontSize);
            return <input key={field.id} id={`field-${field.id}`} className={`document-field ${field.section === "client" ? "client-field" : ""} ${selected === field.id ? "selected" : ""}`} dir={field.section === "client" ? "ltr" : undefined} aria-label={field.label ?? field.id} inputMode={field.type === "text" ? "text" : "decimal"} maxLength={field.maxLength} value={value} onFocus={() => setSelected(field.id)} onChange={(event) => changeValue(field, event.target.value)} onBlur={() => blurField(field)} style={{ left: `${field.x / DOCUMENT_WIDTH * 100}%`, top: `${field.y / DOCUMENT_HEIGHT * 100}%`, width: `${field.width / DOCUMENT_WIDTH * 100}%`, height: `${field.height / DOCUMENT_HEIGHT * 100}%`, textAlign: field.align, fontSize: `${fontSize / DOCUMENT_WIDTH * 100}cqw`, color: styles[field.id]?.color ?? "#214b94" }} />;
          })}
        </div></div></div>
      </section>
      {active && <div className="floating"><span>Tamanho</span><button onClick={() => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], fontSize: Math.max(12, (activeStyle.fontSize ?? active.fontSize) - 1) } }))}><Minus /></button><b>{activeStyle.fontSize ?? active.fontSize}</b><button onClick={() => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], fontSize: Math.min(48, (activeStyle.fontSize ?? active.fontSize) + 1) } }))}><Plus /></button><i /><span>Cor</span><input type="color" value={activeStyle.color ?? "#214b94"} onChange={(event) => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], color: event.target.value } }))} /><i /><button className="delete" onClick={() => changeValue(active, "")}><Trash2 /> Excluir</button></div>}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
