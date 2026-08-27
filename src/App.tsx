import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Download,
  GripHorizontal,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
} from "lucide-react";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const PDF_URL = "/pedido-plasnorte.pdf";
type TextBox = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  align?: "left" | "right";
  cellLeft?: number;
  cellRight?: number;
};
function formatNumberBR(value: string) {
  const clean = value.trim();
  if (!/^(R\$\s*)?[\d.]+(,\d+)?$/.test(clean)) return value;
  const currency = clean.startsWith("R$");
  const decimalPart = clean.includes(",") ? clean.split(",")[1] : "";
  const number = Number(clean.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
  if (!Number.isFinite(number)) return value;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimalPart.length,
    maximumFractionDigits: decimalPart.length,
  }).format(number);
  return currency ? `R$ ${formatted}` : formatted;
}
export default function App() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null),
    [boxes, setBoxes] = useState<TextBox[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [toast, setToast] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null),
    paperRef = useRef<HTMLDivElement>(null);
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2300);
  };
  useEffect(() => {
    const saved = localStorage.getItem("plasnorte-edicao");
    if (saved) {
      try { setBoxes(JSON.parse(saved)); } catch { /* rascunho inválido */ }
    }
  }, []);
  useEffect(() => {
    (async () => {
      const bytes = await fetch(PDF_URL).then((r) => r.arrayBuffer());
      setPdfBytes(bytes);
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise,
        page = await doc.getPage(1),
        base = page.getViewport({ scale: 1 }),
        viewport = page.getViewport({
          scale: 850 / base.width,
          rotation: page.rotate,
        }),
        canvas = canvasRef.current!,
        ratio = devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d")!;
      context.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        background: "#ffffff",
      }).promise;
    })().catch(() => notify("Não foi possível abrir o PDF."));
  }, []);
  const findNearestLine = (clickX: number, clickY: number, rect: DOMRect) => {
    const canvas = canvasRef.current;
    if (!canvas) return clickY;
    const context = canvas.getContext("2d");
    if (!context) return clickY;
    const scaleX = canvas.width / rect.width,
      scaleY = canvas.height / rect.height,
      cx = Math.round(clickX * scaleX),
      cy = Math.round(clickY * scaleY),
      radius = Math.round(20 * scaleY),
      left = Math.round(35 * scaleX),
      right = Math.round(280 * scaleX);
    let bestY = cy,
      bestScore = -1;
    for (
      let y = Math.max(0, cy - radius);
      y < Math.min(canvas.height, cy + radius);
      y++
    ) {
      const x0 = Math.max(0, cx - left),
        width = Math.max(1, Math.min(canvas.width - x0, left + right)),
        pixels = context.getImageData(x0, y, width, 1).data;
      let longest = 0,
        current = 0,
        total = 0,
        gap = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const delta = 255 - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
        if (delta > 7) {
          current += 1 + gap;
          gap = 0;
          total++;
        } else if (current && gap < 2) gap++;
        else {
          longest = Math.max(longest, current);
          current = 0;
          gap = 0;
        }
      }
      longest = Math.max(longest, current);
      const distance = Math.abs(y - cy) / scaleY;
      const score = longest * 100 + total - distance * 8;
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    return bestY / scaleY;
  };
  const findCellBounds = (clickX: number, clickY: number, rect: DOMRect) => {
    const canvas = canvasRef.current,
      context = canvas?.getContext("2d");
    if (!canvas || !context) return { left: clickX - 4, right: clickX + 70 };
    const sx = canvas.width / rect.width,
      sy = canvas.height / rect.height,
      cx = Math.round(clickX * sx),
      cy = Math.round(clickY * sy),
      range = Math.round(130 * sx),
      vertical = Math.round(22 * sy),
      candidates: { x: number; score: number }[] = [];
    for (
      let x = Math.max(0, cx - range);
      x < Math.min(canvas.width, cx + range);
      x++
    ) {
      const y0 = Math.max(0, cy - vertical),
        height = Math.max(1, Math.min(canvas.height - y0, vertical * 2)),
        data = context.getImageData(x, y0, 1, height).data;
      let run = 0,
        longest = 0;
      for (let i = 0; i < data.length; i += 4) {
        const dark = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
        if (dark > 9) {
          run++;
          longest = Math.max(longest, run);
        } else run = 0;
      }
      if (longest > vertical * 0.55)
        candidates.push({ x: x / sx, score: longest });
    }
    const left =
        [...candidates].reverse().find((c) => c.x < clickX - 3)?.x ??
        Math.max(0, clickX - 5),
      right =
        candidates.find((c) => c.x > clickX + 3)?.x ??
        Math.min(rect.width, clickX + 75);
    return { left, right: right > left + 12 ? right : left + 70 };
  };
  const addText = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      !paperRef.current ||
      (e.target !== e.currentTarget && e.target !== canvasRef.current)
    )
      return;
    const r = paperRef.current.getBoundingClientRect(),
      localX = e.clientX - r.left,
      localY = e.clientY - r.top,
      lineY = findNearestLine(localX, localY, r),
      bounds = findCellBounds(localX, lineY, r),
      id = crypto.randomUUID(),
      item: TextBox = {
        id,
        text: "",
        x: (localX / r.width) * 100,
        y: Math.max(0, ((lineY - 22) / r.height) * 100),
        width: 7,
        fontSize: 16,
        color: "#214b94",
        cellLeft: (bounds.left / r.width) * 100,
        cellRight: (bounds.right / r.width) * 100,
      };
    setBoxes((current) => [...current, item]);
    setSelected(id);
    setTimeout(() => document.getElementById(`text-${id}`)?.focus(), 20);
  };
  const update = (id: string, patch: Partial<TextBox>) =>
    setBoxes((c) => c.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const remove = () => {
    if (selected) {
      setBoxes(boxes.filter((b) => b.id !== selected));
      setSelected(null);
    }
  };
  const drag = (e: React.PointerEvent, b: TextBox) => {
    e.stopPropagation();
    if (!paperRef.current) return;
    const r = paperRef.current.getBoundingClientRect(),
      sx = e.clientX,
      sy = e.clientY,
      ix = b.x,
      iy = b.y,
      move = (p: PointerEvent) =>
        update(b.id, {
          x: Math.max(0, Math.min(98, ix + ((p.clientX - sx) / r.width) * 100)),
          y: Math.max(
            0,
            Math.min(98, iy + ((p.clientY - sy) / r.height) * 100),
          ),
        }),
      up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
      };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const saveDraft = () => {
    localStorage.setItem("plasnorte-edicao", JSON.stringify(boxes));
    notify("Edição salva neste navegador!");
  };
  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const flattened = document.createElement("canvas");
      flattened.width = canvas.width;
      flattened.height = canvas.height;
      const context = flattened.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      const displayWidth = paperRef.current?.getBoundingClientRect().width || 850;
      const scale = flattened.width / displayWidth;
      for (const b of boxes) {
        if (!b.text.trim()) continue;
        context.font = `${b.fontSize * scale}px Arial, sans-serif`;
        context.fillStyle = b.color;
        context.textBaseline = "alphabetic";
        context.textAlign = b.align === "right" ? "right" : "left";
        const x =
          b.align === "right" && b.cellRight !== undefined
            ? (flattened.width * b.cellRight) / 100 - 3 * scale
            : (flattened.width * b.x) / 100;
        const y =
          (flattened.height * b.y) / 100 + b.fontSize * 1.55 * scale;
        context.fillText(b.text, x, y);
      }
      const output = await PDFDocument.create();
      const image = await output.embedPng(flattened.toDataURL("image/png"));
      const page = output.addPage([606, 840]);
      page.drawImage(image, { x: 0, y: 0, width: 606, height: 840 });
      const data = await output.save(),
        blob = new Blob([new Uint8Array(data)], { type: "application/pdf" }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "PEDIDO-PLASNORTE-PREENCHIDO.pdf";
      a.click();
      URL.revokeObjectURL(url);
      notify("PDF exportado com todas as edições!");
    } catch {
      notify("Não foi possível salvar o PDF.");
    }
  };
  const active = boxes.find((b) => b.id === selected);
  return (
    <main>
      <header>
        <div className="brand">
          <div className="mark">PN</div>
          <div>
            <b>PLASNORTE</b>
            <span>Preenchimento de pedido</span>
          </div>
        </div>
        <div className="hint">
          <Type /> Clique em uma linha e comece a digitar
        </div>
        <div className="actions">
          <button
            onClick={() => {
              if (confirm("Remover todos os textos?")) {
                setBoxes([]);
                setSelected(null);
              }
            }}
          >
            <RotateCcw /> Limpar
          </button>
          <button onClick={saveDraft}>
            <Save /> Salvar
          </button>
          <button className="download" onClick={download}>
            <Download /> Exportar PDF
          </button>
        </div>
      </header>
      <section className="workspace">
        <div className="guide">
          <b>Como editar</b>
          <span>
            1. Clique no local &nbsp; 2. Digite &nbsp; 3. Arraste pelo ponto
            azul
          </span>
        </div>
        <div className="paper-shell">
          <div ref={paperRef} className="paper" onClick={addText}>
            <canvas ref={canvasRef} />
            {boxes.map((b) => (
              <div
                key={b.id}
                className={`text-box ${selected === b.id ? "selected" : ""}`}
                style={{
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  width: `${b.width}%`,
                  fontSize: `${b.fontSize}px`,
                  color: b.color,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(b.id);
                }}
              >
                <button className="drag" onPointerDown={(e) => drag(e, b)}>
                  <GripHorizontal />
                </button>
                <input
                  id={`text-${b.id}`}
                  value={b.text}
                  placeholder="Digite"
                  onFocus={() => setSelected(b.id)}
                  onBlur={() => {
                    if (!b.text.trim()) {
                      setBoxes((current) =>
                        current.filter((item) => item.id !== b.id),
                      );
                      setSelected((current) =>
                        current === b.id ? null : current,
                      );
                    } else {
                      update(b.id, { text: formatNumberBR(b.text) });
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value,
                      numeric = /^[\s\d.,R$%+\-\/]*$/.test(v) && /\d/.test(v);
                    update(b.id, {
                      text: v,
                      fontSize: numeric ? 13 : 16,
                      align: numeric ? "right" : "left",
                      x:
                        numeric && b.cellLeft !== undefined ? b.cellLeft : b.x,
                      width:
                        numeric &&
                        b.cellLeft !== undefined &&
                        b.cellRight !== undefined
                          ? Math.max(3, b.cellRight - b.cellLeft)
                          : Math.max(4, Math.min(65, v.length * 1.05 + 3)),
                    });
                  }}
                  style={{
                    fontSize: `${b.fontSize}px`,
                    color: b.color,
                    textAlign: b.align || "left",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
      {active && (
        <div className="floating">
          <span>Tamanho</span>
          <button
            onClick={() =>
              update(active.id, { fontSize: Math.max(8, active.fontSize - 1) })
            }
          >
            <Minus />
          </button>
          <b>{active.fontSize}</b>
          <button
            onClick={() =>
              update(active.id, { fontSize: Math.min(48, active.fontSize + 1) })
            }
          >
            <Plus />
          </button>
          <i />
          <span>Cor</span>
          <input
            type="color"
            value={active.color}
            onChange={(e) => update(active.id, { color: e.target.value })}
          />
          <i />
          <button className="delete" onClick={remove}>
            <Trash2 /> Excluir
          </button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
function hex(v: string): [number, number, number] {
  const h = v.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
