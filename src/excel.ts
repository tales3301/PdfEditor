import type { ProductColumn } from "./fieldConfig";

export type ProductDefaults = Partial<Record<ProductColumn, string>>;

export const DEFAULT_PRODUCTS: ProductDefaults[] = [
  { descricao: "SACO DE LIXO REFORÇADO 15 LITROS", medida: "39 x 58 x 0,04", unidade: "20 / PACOTE", fardo: "10" },
  { descricao: "SACO DE LIXO REFORÇADO 30 LITROS", medida: "51 x 70 x 0,04", unidade: "10 / PACOTE", fardo: "10" },
  { descricao: "SACO DE LIXO REFORÇADO 50 LITROS", medida: "65 x 80 x 0,07", unidade: "10 / PACOTE", fardo: "10" },
  { descricao: "SACO DE LIXO REFORÇADO 100 LITROS", medida: "75 x 100 x 0,07", unidade: "05 / PACOTE", fardo: "10" },
  { descricao: "SACO DE LIXO REFORÇADO 150 LITROS", medida: "90 x 100 x 0,10", unidade: "05 / PACOTE", fardo: "10" },
  { descricao: "SACO DE LIXO REFORÇADO 200 LITROS", medida: "95 x 125 x 0,10", unidade: "05 / PACOTE", fardo: "10" },
  {},
  { descricao: "SACO DE LIXO REFORÇADO 15 LITROS", medida: "39 x 58 x 0,04", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "SACO DE LIXO REFORÇADO 30 LITROS", medida: "51 x 70 x 0,04", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "SACO DE LIXO REFORÇADO 50 LITROS", medida: "65 x 80 x 0,07", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "SACO DE LIXO REFORÇADO 100 LITROS", medida: "75 x 100 x 0,07", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "SACO DE LIXO REFORÇADO 150 LITROS", medida: "90 x 100 x 0,10", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "SACO DE LIXO REFORÇADO 200 LITROS", medida: "95 x 125 x 0,10", unidade: "CENTO (100)", fardo: "-" },
  {},
  { descricao: "CAPA FARDO CRISTAL", medida: "50 x 80 x 0,08", unidade: "CENTO (100)", fardo: "-" },
  { descricao: "CAPA FARDO RECICLADO", medida: "50 x 80 x 0,08", unidade: "CENTO (100)", fardo: "-" },
  {},
  { descricao: "SACOLAS RECICLADAS", medida: "30 x 45", unidade: "5 KG", fardo: "-" },
  { descricao: "SACOLAS RECICLADAS", medida: "40 x 50", unidade: "5 KG", fardo: "-" },
  { descricao: "SACOLAS RECICLADAS", medida: "50 x 60", unidade: "5 KG", fardo: "-" },
  {},
  { descricao: "BOBINAS PICOTADAS", medida: "FARDO C/ 6 UND", fardo: "-" },
  { descricao: "20 x 30", medida: "7 KG", fardo: "-" },
  { descricao: "25 x 35", medida: "9 KG", fardo: "-" },
  { descricao: "30 x 40", medida: "11 KG", fardo: "-" },
  { descricao: "35 x 45", medida: "14 KG", fardo: "-" },
  { descricao: "40 x 60", medida: "17 KG", fardo: "-" },
  {}, {}, {}, {}, {}, {}, {}, {}, {},
];

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let name = "";
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

export async function createExcelFile(rows: Array<{ values: string[]; style?: number }>) {
  const { zipSync, strToU8 } = await import("fflate");
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.values.map((value, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr" s="${row.style ?? 0}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("");
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="7" width="17" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><mergeCells count="1"><mergeCell ref="A1:G1"/></mergeCells></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pedido PlasNorte" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173F70"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245B8D"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD5E0E8"/></left><right style="thin"><color rgb="FFD5E0E8"/></right><top style="thin"><color rgb="FFD5E0E8"/></top><bottom style="thin"><color rgb="FFD5E0E8"/></bottom></border></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  };
  return zipSync(files, { level: 6 });
}

function cellColumn(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    return text.split(/\r?\n/).filter(Boolean).map((line) => line.split(line.includes(";") ? ";" : ",").map((cell) => cell.replace(/^"|"$/g, "").trim()));
  }
  const { unzipSync, strFromU8 } = await import("fflate");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const sharedXml = archive["xl/sharedStrings.xml"] ? new DOMParser().parseFromString(strFromU8(archive["xl/sharedStrings.xml"]), "application/xml") : null;
  const shared = sharedXml ? [...sharedXml.getElementsByTagName("si")].map((item) => item.textContent ?? "") : [];
  const sheetName = Object.keys(archive).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("Planilha sem uma aba válida.");
  const document = new DOMParser().parseFromString(strFromU8(archive[sheetName]), "application/xml");
  return [...document.getElementsByTagName("row")].map((row) => {
    const output: string[] = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      const index = cellColumn(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = type === "inlineStr" ? cell.getElementsByTagName("t")[0]?.textContent ?? "" : cell.getElementsByTagName("v")[0]?.textContent ?? "";
      output[index] = type === "s" ? shared[Number(raw)] ?? "" : raw;
    }
    return output.map((value) => value ?? "");
  });
}
