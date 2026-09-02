import { useEffect, useMemo, useRef, useState } from "react";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Clock3, Download, FilePlus2, FileSpreadsheet, History, MessageCircle, Minus, Plus, RotateCcw, Save, Trash2, Type, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, FIELD_BY_ID, FIELD_DEFINITIONS, FieldDefinition, productFieldId } from "./fieldConfig";
import { createExcelFile, DEFAULT_PRODUCTS, readSpreadsheet } from "./excel";

const PDF_URL = "/pedido-plasnorte.pdf";
const STORAGE_KEY = "plasnorte-edicao";
const HISTORY_KEY = "plasnorte-historico";
const TABLE_TOP = 784;
const TABLE_BOTTOM = 2061;
type Values = Record<string, string>;
type FieldStyle = { fontSize?: number; color?: string };
type FieldStyles = Record<string, FieldStyle>;
type SavedOrder = { id: string; savedAt: string; values: Values; styles: FieldStyles; manualTotals: number[]; manualGeneral: boolean };
type ConfirmAction = "clear" | "new" | null;
type ExportKind = "pdf" | "excel" | "whatsapp";

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

function removeOnlyUnlistedProducts(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const scaleX = canvas.width / DOCUMENT_WIDTH;
  const scaleY = canvas.height / DOCUMENT_HEIGHT;
  const rowHeight = (TABLE_BOTTOM - TABLE_TOP) / 36;
  const columns = [[66, 532], [532, 710], [710, 891], [891, 978]];
  const cells = [
    [28, [0]], [29, [0, 1, 2, 3]], [30, [0, 1, 2, 3]],
    [32, [0, 1]], [33, [0, 1, 2]], [34, [0, 1, 2]], [35, [0, 1, 2]],
  ] as const;

  for (const [row, columnIndexes] of cells) {
    for (const columnIndex of columnIndexes) {
      const [left, right] = columns[columnIndex];
      // A área de leitura fica afastada das quatro bordas da célula, para que
      // as linhas originais do PDF nunca sejam tocadas.
      const x = Math.round((left + 2) * scaleX);
      const y = Math.round((TABLE_TOP + row * rowHeight + 1) * scaleY);
      const width = Math.round((right - left - 4) * scaleX);
      const height = Math.round((rowHeight - 2) * scaleY);
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, width, height);
    }
  }
}

function removePrintedOrderNumber(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const scaleX = canvas.width / DOCUMENT_WIDTH;
  const scaleY = canvas.height / DOCUMENT_HEIGHT;
  const field = FIELD_BY_ID.get("pedido");
  if (!field) return;

  // Limpa somente o interior da célula, mantendo intacta a moldura do PDF.
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(
    Math.round((field.x + 3) * scaleX),
    Math.round((field.y + 3) * scaleY),
    Math.round((field.width - 6) * scaleX),
    Math.round((field.height - 6) * scaleY),
  );
  context.restore();
}

function restoreOriginalTableDividers(canvas: HTMLCanvasElement, original: ImageData) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const scaleX = canvas.width / DOCUMENT_WIDTH;
  const scaleY = canvas.height / DOCUMENT_HEIGHT;
  const rowHeight = (TABLE_BOTTOM - TABLE_TOP) / 36;
  const top = Math.round((TABLE_TOP + rowHeight * 28) * scaleY);
  const bottom = Math.round(TABLE_BOTTOM * scaleY);
  for (let row = 28; row <= 36; row++) {
    const y = Math.round((TABLE_TOP + row * rowHeight) * scaleY) - 1;
    context.putImageData(original, 0, 0, 0, y, canvas.width, 3);
  }
  // As três divisórias que cruzam as células removidas; a faixa inclui toda a
  // antialiasing original para não deixar interrupções no traço.
  for (const position of [66, 532, 710, 891]) {
    const x = Math.round(position * scaleX) - 4;
    context.putImageData(original, 0, 0, x, top, 9, bottom - top);
  }
  // Pequena falha residual indicada na divisória do campo FARDO/QUANT.
  const repairedX = Math.round(891 * scaleX) + 0.5;
  context.save();
  context.strokeStyle = "#64717a";
  context.lineWidth = Math.max(1, scaleX * 1.5);
  context.beginPath();
  context.moveTo(repairedX, top);
  context.lineTo(repairedX, bottom);
  context.stroke();
  context.restore();
}

export default function App() {
  const [values, setValues] = useState<Values>({});
  const [styles, setStyles] = useState<FieldStyles>({});
  const [manualTotals, setManualTotals] = useState<Set<number>>(new Set());
  const [manualGeneral, setManualGeneral] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pendingExport, setPendingExport] = useState<ExportKind | null>(null);
  const [history, setHistory] = useState<SavedOrder[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [zoom, setZoom] = useState(() => window.innerWidth <= 700 ? .75 : 1);
  const hydrated = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2300); };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_KEY);
    if (savedHistory) try { setHistory(JSON.parse(savedHistory)); } catch { localStorage.removeItem(HISTORY_KEY); }
    if (!saved) { hydrated.current = true; return; }
    try {
      const draft = JSON.parse(saved);
      if (Array.isArray(draft)) setValues(migrateLegacyBoxes(draft));
      else {
        const savedValues = draft.values ?? {};
        const isMockOrder = savedValues.pedido === "10428" && savedValues.cliente === "Mercado Modelo Ltda.";
        setValues(isMockOrder ? {} : savedValues);
        setStyles(draft.styles ?? {});
        setManualTotals(new Set(isMockOrder ? [] : draft.manualTotals ?? []));
        setManualGeneral(isMockOrder ? false : Boolean(draft.manualGeneral));
        if (isMockOrder) localStorage.removeItem(STORAGE_KEY);
      }
    } catch { notify("O rascunho anterior não pôde ser carregado."); }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, values, styles, manualTotals: [...manualTotals], manualGeneral }));
      setSaveState("saved");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [values, styles, manualTotals, manualGeneral]);

  useEffect(() => {
    (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
      const bytes = await fetch(PDF_URL).then((response) => response.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const page = await doc.getPage(1), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 850 / base.width, rotation: page.rotate });
      const canvas = canvasRef.current!, ratio = devicePixelRatio || 1;
      canvas.width = viewport.width * ratio; canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined, background: "#ffffff" }).promise;
      const originalTable = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      removePrintedOrderNumber(canvas);
      removeOnlyUnlistedProducts(canvas);
      restoreOriginalTableDividers(canvas, originalTable);
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
    if (!value || field.type === "text" || field.id === "pedido") return;
    const parsed = parseNumberBR(value);
    if (parsed === null) return;
    setValues((current) => updateGrandTotal({ ...current, [field.id]: field.type === "currency" ? formatCurrency(parsed) : formatNumberBR(value) }));
  };
  const addToHistory = (snapshotValues = values) => {
    if (!Object.values(snapshotValues).some((value) => value.trim())) return;
    const snapshot: SavedOrder = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), values: snapshotValues, styles, manualTotals: [...manualTotals], manualGeneral };
    const next = [snapshot, ...history].slice(0, 12);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };
  const saveDraft = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, values, styles, manualTotals: [...manualTotals], manualGeneral }));
    setSaveState("saved");
    addToHistory();
    notify("Pedido salvo no histórico!");
  };
  const clearAll = () => setConfirmAction("clear");
  const newOrder = () => setConfirmAction("new");
  const confirmReset = () => {
    if (confirmAction === "new") addToHistory();
    setValues({});
    if (confirmAction === "clear") setStyles({});
    setManualTotals(new Set()); setManualGeneral(false); setSelected(null);
    localStorage.removeItem(STORAGE_KEY);
    const wasNew = confirmAction === "new";
    setConfirmAction(null);
    notify(wasNew ? "Novo pedido iniciado." : "Todos os campos foram limpos.");
  };
  const restoreOrder = (order: SavedOrder) => {
    setValues(order.values); setStyles(order.styles); setManualTotals(new Set(order.manualTotals)); setManualGeneral(order.manualGeneral); setHistoryOpen(false);
    notify("Pedido restaurado do histórico.");
  };
  const fileName = (extension: "pdf" | "xlsx") => {
    const clean = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35);
    const date = new Intl.DateTimeFormat("pt-BR").format(new Date()).replace(/\//g, "-");
    const orderNumber = (values.pedido || "").replace(/\D/g, "");
    return `Pedido-${orderNumber || "Sem-numero"}-${clean(values.cliente || "") || "Cliente"}-${date}.${extension}`;
  };
  const missingInformation = () => {
    const missing: string[] = [];
    if (!values.pedido?.trim()) missing.push("Número do pedido");
    if (!values.cliente?.trim()) missing.push("Nome do cliente");
    if (!Array.from({ length: 36 }, (_, row) => values[productFieldId(row, "quantidade")] || values[productFieldId(row, "valorTotal")]).some(Boolean)) missing.push("Ao menos um produto com quantidade ou valor");
    if (!values.condicaoPagamento?.trim()) missing.push("Condição de pagamento");
    return missing;
  };
  const requestExport = (kind: ExportKind) => {
    if (missingInformation().length) setPendingExport(kind);
    else if (kind === "pdf") void exportPdf(); else if (kind === "excel") void exportExcel(); else void shareWhatsApp();
  };

  const createPdfBlob = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { PDFDocument } = await import("pdf-lib");
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width; flattened.height = canvas.height;
    const context = flattened.getContext("2d")!;
    context.drawImage(canvas, 0, 0);
    const sx = flattened.width / DOCUMENT_WIDTH, sy = flattened.height / DOCUMENT_HEIGHT;
    for (const field of FIELD_DEFINITIONS) {
      const value = values[field.id]?.trim(); if (!value) continue;
      const fontSize = fittedFontSize(field, value, styles[field.id]?.fontSize);
      const productField = field.row !== undefined;
      const signatureField = field.id === "assinaturaVendedor" || field.id === "assinaturaComprador";
      context.font = `${productField ? "800" : signatureField ? "600" : "500"} ${fontSize * sx}px ${productField ? '"Arial Narrow", Arial, sans-serif' : '"DM Sans", Arial, sans-serif'}`;
      context.fillStyle = signatureField ? "#173f70" : styles[field.id]?.color ?? (productField ? "#343b41" : "#214b94");
      context.textBaseline = "middle"; context.textAlign = field.align;
      const leftInset = productField && field.column === "descricao" ? 24 : 5;
      const x = field.align === "right" ? (field.x + field.width - 5) * sx : field.align === "center" ? (field.x + field.width / 2) * sx : (field.x + leftInset) * sx;
      context.fillText(value, x, (field.y + field.height / 2) * sy, (field.width - 10) * sx);
    }
    const output = await PDFDocument.create(), image = await output.embedPng(flattened.toDataURL("image/png"));
    const page = output.addPage([606, 840]); page.drawImage(image, { x: 0, y: 0, width: 606, height: 840 });
    const data = await output.save();
    return new Blob([new Uint8Array(data)], { type: "application/pdf" });
  };
  const exportPdf = async () => {
    try {
      const blob = await createPdfBlob(); if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName("pdf"); anchor.click(); URL.revokeObjectURL(url);
      addToHistory();
      notify("PDF exportado com todos os campos!");
    } catch { notify("Não foi possível salvar o PDF."); }
  };
  const shareWhatsApp = async () => {
    const mobileShare = /Android|iPhone|iPad/i.test(navigator.userAgent) && Boolean(navigator.share);
    const whatsappWindow = mobileShare ? null : window.open("about:blank", "_blank");
    try {
      const blob = await createPdfBlob(); if (!blob) { whatsappWindow?.close(); return; }
      const name = fileName("pdf");
      const file = new File([blob], name, { type: "application/pdf" });
      if (mobileShare && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `Pedido ${values.pedido || "PlasNorte"}`, text: `Pedido PlasNorte${values.cliente ? ` - ${values.cliente}` : ""}`, files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        const message = encodeURIComponent(`Olá! Segue o pedido ${values.pedido || ""}${values.cliente ? ` do cliente ${values.cliente}` : ""}. O PDF foi baixado; anexe-o nesta conversa.`);
        if (whatsappWindow) whatsappWindow.location.href = `https://web.whatsapp.com/send?text=${message}`;
        else window.open(`https://web.whatsapp.com/send?text=${message}`, "_blank");
        notify("PDF baixado. Anexe-o na conversa do WhatsApp.");
      }
      addToHistory();
    } catch (error) {
      whatsappWindow?.close();
      if (error instanceof Error && error.name !== "AbortError") notify("Não foi possível compartilhar o PDF.");
    }
  };
  const exportExcel = async () => {
    const rowValue = (row: number, column: Parameters<typeof productFieldId>[1]) => values[productFieldId(row, column)]?.trim() || DEFAULT_PRODUCTS[row]?.[column] || "";
    const rows: Array<{ values: string[]; style?: number }> = [
      { values: ["PEDIDO PLASNORTE"], style: 1 },
      { values: ["Número do pedido", values.pedido ?? ""] },
      { values: ["Cliente", values.cliente ?? ""] },
      { values: ["Telefone", values.fone ?? "", "Celular", values.celular ?? ""] },
      { values: ["Endereço", values.endereco ?? ""] },
      { values: ["Município", values.municipio ?? "", "UF", values.uf ?? "", "CEP", values.cep ?? ""] },
      { values: ["CNPJ/CPF", values.cnpjCpf ?? "", "Inscrição estadual", values.inscricaoEstadual ?? ""] },
      { values: ["E-mail", values.email ?? ""] },
      { values: [""] },
      { values: ["Descrição do produto", "Medida", "Unidade", "Fardo", "Quantidade", "Valor unitário", "Valor total"], style: 2 },
      ...Array.from({ length: 36 }, (_, row) => ({ values: [rowValue(row, "descricao"), rowValue(row, "medida"), rowValue(row, "unidade"), rowValue(row, "fardo"), rowValue(row, "quantidade"), rowValue(row, "valorUnitario"), rowValue(row, "valorTotal")], style: 3 })),
      { values: ["Condição de pagamento", values.condicaoPagamento ?? "", "", "", "", "Total geral", values.totalGeral ?? ""], style: 3 },
      { values: ["Vendedor", values.assinaturaVendedor ?? "", "", "", "Comprador", values.assinaturaComprador ?? ""], style: 3 },
    ];
    const data = await createExcelFile(rows);
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName("xlsx"); anchor.click(); URL.revokeObjectURL(url);
    addToHistory();
    notify("Planilha Excel exportada com sucesso!");
  };
  const importSpreadsheet = async (file?: File) => {
    if (!file) return;
    try {
      const rows = await readSpreadsheet(file);
      const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const headerIndex = rows.findIndex((row) => normalize(row[0]).includes("descricao") && row.some((cell) => normalize(cell).includes("quantidade")));
      if (headerIndex < 0) throw new Error("Cabeçalhos não encontrados");
      const next: Values = { ...values };
      const metadata: Record<string, string> = { "numero do pedido": "pedido", cliente: "cliente", telefone: "fone", celular: "celular", endereco: "endereco", municipio: "municipio", uf: "uf", cep: "cep", "cnpj/cpf": "cnpjCpf", "inscricao estadual": "inscricaoEstadual", "e-mail": "email" };
      for (const row of rows.slice(0, headerIndex)) for (let index = 0; index < row.length - 1; index++) { const id = metadata[normalize(row[index])]; if (id) next[id] = row[index + 1] ?? ""; }
      const columns = ["descricao", "medida", "unidade", "fardo", "quantidade", "valorUnitario", "valorTotal"] as const;
      const importedManual = new Set<number>();
      rows.slice(headerIndex + 1, headerIndex + 37).forEach((row, rowIndex) => {
        if (normalize(row[0]).includes("condicao de pagamento")) return;
        columns.forEach((column, columnIndex) => {
          const imported = row[columnIndex] ?? "";
          const fixed = DEFAULT_PRODUCTS[rowIndex]?.[column] ?? "";
          next[productFieldId(rowIndex, column)] = imported === fixed && ["descricao", "medida", "unidade", "fardo"].includes(column) ? "" : imported;
        });
        const quantity = parseNumberBR(next[productFieldId(rowIndex, "quantidade")] ?? "");
        const unit = parseNumberBR(next[productFieldId(rowIndex, "valorUnitario")] ?? "");
        if (quantity !== null && unit !== null) next[productFieldId(rowIndex, "valorTotal")] = formatCurrency(quantity * unit);
        else if (next[productFieldId(rowIndex, "valorTotal")]) importedManual.add(rowIndex);
      });
      const footer = rows.find((row) => normalize(row[0]).includes("condicao de pagamento"));
      if (footer) { next.condicaoPagamento = footer[1] ?? ""; next.totalGeral = footer[6] ?? ""; }
      const signatures = rows.find((row) => normalize(row[0]) === "vendedor");
      if (signatures) { next.assinaturaVendedor = signatures[1] ?? ""; next.assinaturaComprador = signatures[5] ?? ""; }
      let importedTotal = 0;
      for (let row = 0; row < 36; row++) importedTotal += parseNumberBR(next[productFieldId(row, "valorTotal")] ?? "") ?? 0;
      next.totalGeral = importedTotal ? formatCurrency(importedTotal) : next.totalGeral ?? "";
      setManualTotals(importedManual); setManualGeneral(false); setValues(next);
      notify("Planilha importada com sucesso!");
    } catch { notify("Não foi possível importar esta planilha."); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };

  const active = selected ? FIELD_BY_ID.get(selected) : undefined;
  const activeStyle = active ? styles[active.id] ?? {} : {};
  const activeIsSignature = active?.id === "assinaturaVendedor" || active?.id === "assinaturaComprador";
  const activeMinSize = activeIsSignature ? 20 : 12;
  const activeMaxSize = activeIsSignature ? 40 : 48;
  const renderedFields = useMemo(() => FIELD_DEFINITIONS, []);
  const filledFields = Object.values(values).filter((value) => value.trim()).length;
  const focusField = (id: string) => {
    const element = document.getElementById(`field-${id}`) as HTMLInputElement | null;
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => element?.focus(), 350);
  };
  return (
    <main>
      <header>
        <div className="brand"><div className="mark"><img src="/plasnorte-logo.jpeg" alt="Logo PlasNorte" /></div><div><b>PLASNORTE</b><span>Preenchimento de pedido</span></div></div>
        <div className="hint"><Type /> Clique em um campo e comece a digitar</div>
        <div className="actions"><button onClick={newOrder} title="Iniciar novo pedido"><FilePlus2 /> <span>Novo</span></button><button onClick={clearAll} title="Limpar formulário"><RotateCcw /> <span>Limpar</span></button><button onClick={() => setHistoryOpen(true)} title="Ver histórico"><History /> <span>Histórico</span></button><button onClick={saveDraft} title="Salvar no histórico"><Save /> <span>Salvar</span></button><button className="excel" onClick={() => requestExport("excel")} title="Exportar planilha"><FileSpreadsheet /> <span>Excel</span></button><button className="whatsapp" onClick={() => requestExport("whatsapp")} title="Enviar pelo WhatsApp"><MessageCircle /> <span>WhatsApp</span></button><button className="download" onClick={() => requestExport("pdf")} title="Exportar documento"><Download /> <span>PDF</span></button></div>
      </header>
      <section className="workspace">
        <div className="guide"><div><b>Como editar</b><span>1. Clique no campo &nbsp; 2. Digite &nbsp; 3. Salve ou exporte</span></div><div className="guide-tools"><div className={`auto-save ${saveState}`}><i /> <b>{saveState === "saving" ? "Salvando…" : "Alterações salvas"}</b></div><div className="zoom-controls"><button onClick={() => setZoom((value) => Math.max(.7, value - .1))} title="Diminuir zoom"><ZoomOut /></button><strong>{Math.round(zoom * 100)}%</strong><button onClick={() => setZoom((value) => Math.min(1.4, value + .1))} title="Aumentar zoom"><ZoomIn /></button></div></div></div>
        <div className="editor-layout">
          <aside className="side-panel overview-panel">
            <span className="side-kicker">VISÃO GERAL</span>
            <h2>Seu pedido</h2>
            <p>Acompanhe o preenchimento antes de exportar.</p>
            <div className="completion-ring"><strong>{filledFields}</strong><span>campos<br />preenchidos</span></div>
            <div className={`side-status ${saveState}`}><i /><div><b>{saveState === "saving" ? "Salvando…" : "Alterações salvas"}</b><span>O rascunho é salvo automaticamente neste navegador.</span></div></div>
            <button className="side-action" onClick={() => importRef.current?.click()}><Upload /> Importar planilha</button>
            <input ref={importRef} className="file-input" type="file" accept=".xlsx,.csv" onChange={(event) => void importSpreadsheet(event.target.files?.[0])} />
          </aside>
          <div className="paper-shell"><div className="paper fixed-form" style={{ width: `${850 * zoom}px` }}><canvas ref={canvasRef} /><div className="field-layer">
          {renderedFields.map((field) => {
            const value = values[field.id] ?? "";
            const fontSize = fittedFontSize(field, value, styles[field.id]?.fontSize);
            const productField = field.row !== undefined;
            const signatureField = field.id === "assinaturaVendedor" || field.id === "assinaturaComprador";
            return <input key={field.id} id={`field-${field.id}`} className={`document-field ${field.section === "client" ? "client-field" : ""} ${productField ? "product-field" : ""} ${productField && field.column === "descricao" ? "description-field" : ""} ${signatureField ? "signature-field" : ""} ${selected === field.id ? "selected" : ""}`} dir={field.section === "client" ? "ltr" : undefined} aria-label={field.label ?? field.id} inputMode={field.type === "text" ? "text" : "decimal"} maxLength={field.maxLength} value={value} onFocus={() => setSelected(field.id)} onChange={(event) => changeValue(field, event.target.value)} onBlur={() => blurField(field)} style={{ left: `${field.x / DOCUMENT_WIDTH * 100}%`, top: `${field.y / DOCUMENT_HEIGHT * 100}%`, width: `${field.width / DOCUMENT_WIDTH * 100}%`, height: `${field.height / DOCUMENT_HEIGHT * 100}%`, textAlign: field.align, fontSize: `${fontSize / DOCUMENT_WIDTH * 100}cqw`, color: styles[field.id]?.color ?? (productField ? "#343b41" : "#214b94") }} />;
          })}
          </div></div></div>
          <aside className="side-panel shortcuts-panel">
            <span className="side-kicker">ACESSO RÁPIDO</span>
            <h2>Ir para seção</h2>
            <nav aria-label="Atalhos do formulário">
              <button onClick={() => focusField("cliente")}><span>01</span><div><b>Dados do cliente</b><small>Contato e endereço</small></div></button>
              <button onClick={() => focusField(productFieldId(0, "quantidade"))}><span>02</span><div><b>Produtos</b><small>Quantidades e valores</small></div></button>
              <button onClick={() => focusField("condicaoPagamento")}><span>03</span><div><b>Pagamento</b><small>Condição e total</small></div></button>
              <button onClick={() => focusField("assinaturaVendedor")}><span>04</span><div><b>Assinaturas</b><small>Vendedor e comprador</small></div></button>
            </nav>
            <div className="side-tip"><Type /><span>Clique em qualquer campo destacado para começar a editar.</span></div>
          </aside>
        </div>
      </section>
      {active && <div className="floating"><span>Tamanho</span><button disabled={(activeStyle.fontSize ?? active.fontSize) <= activeMinSize} onClick={() => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], fontSize: Math.max(activeMinSize, (activeStyle.fontSize ?? active.fontSize) - 1) } }))}><Minus /></button><b>{activeStyle.fontSize ?? active.fontSize}</b><button disabled={(activeStyle.fontSize ?? active.fontSize) >= activeMaxSize} onClick={() => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], fontSize: Math.min(activeMaxSize, (activeStyle.fontSize ?? active.fontSize) + 1) } }))}><Plus /></button><i /><span>Cor</span><input type="color" value={activeStyle.color ?? "#214b94"} onChange={(event) => setStyles((current) => ({ ...current, [active.id]: { ...current[active.id], color: event.target.value } }))} /><i /><button className="delete" onClick={() => changeValue(active, "")}><Trash2 /> Excluir</button></div>}
      {confirmAction && <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmAction(null)}>
        <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="confirm-icon">{confirmAction === "new" ? <FilePlus2 /> : <Trash2 />}</div>
          <div className="confirm-copy"><h2 id="clear-title">{confirmAction === "new" ? "Iniciar novo pedido?" : "Limpar formulário?"}</h2><p>{confirmAction === "new" ? "O pedido atual será guardado no histórico e um formulário vazio será aberto, mantendo suas preferências visuais." : "Todos os dados e ajustes visuais serão removidos. Esta ação não pode ser desfeita."}</p></div>
          <div className="confirm-actions"><button onClick={() => setConfirmAction(null)}>Cancelar</button><button className={confirmAction === "clear" ? "confirm-danger" : "confirm-primary"} onClick={confirmReset}>{confirmAction === "new" ? <FilePlus2 /> : <Trash2 />} {confirmAction === "new" ? "Novo pedido" : "Limpar tudo"}</button></div>
        </div>
      </div>}
      {pendingExport && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingExport(null)}>
        <div className="confirm-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="warning-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="confirm-icon warning-icon">!</div>
          <div className="confirm-copy"><h2 id="warning-title">Há informações pendentes</h2><p>Confira antes de exportar:</p><ul>{missingInformation().map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div className="confirm-actions"><button onClick={() => setPendingExport(null)}>Voltar e preencher</button><button className="confirm-primary" onClick={() => { const kind = pendingExport; setPendingExport(null); if (kind === "pdf") void exportPdf(); else if (kind === "excel") void exportExcel(); else void shareWhatsApp(); }}>Continuar assim mesmo</button></div>
        </div>
      </div>}
      {historyOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
        <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="history-heading"><div><span className="side-kicker">PEDIDOS SALVOS</span><h2 id="history-title">Histórico</h2></div><div className="history-heading-actions"><button className="history-import" onClick={() => { setHistoryOpen(false); window.setTimeout(() => importRef.current?.click(), 100); }}><Upload /> Importar</button><button onClick={() => setHistoryOpen(false)} aria-label="Fechar">×</button></div></div>
          <div className="history-list">{history.length ? history.map((order) => <button key={order.id} onClick={() => restoreOrder(order)}><span className="history-icon"><Clock3 /></span><div><b>{order.values.cliente || "Cliente não informado"}</b><small>Pedido {order.values.pedido || "sem número"} · {new Date(order.savedAt).toLocaleString("pt-BR")}</small></div><strong>Restaurar</strong></button>) : <div className="history-empty"><History /><b>Nenhum pedido salvo</b><span>Use o botão Salvar para criar seu histórico.</span></div>}</div>
        </div>
      </div>}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
