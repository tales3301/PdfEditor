export const DOCUMENT_WIDTH = 1600;
export const DOCUMENT_HEIGHT = 2218;

export type FieldType = "text" | "number" | "currency";

export type FieldDefinition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: FieldType;
  align: "left" | "center" | "right";
  fontSize: number;
  maxLength: number;
  row?: number;
  column?: ProductColumn;
  label?: string;
  section?: "client";
};

export type ProductColumn =
  | "descricao"
  | "medida"
  | "unidade"
  | "fardo"
  | "quantidade"
  | "valorUnitario"
  | "valorTotal";

const personalFields: FieldDefinition[] = [
  { id: "pedido", label: "Número do pedido", x: 1340, y: 282, width: 210, height: 64, type: "number", align: "center", fontSize: 31, maxLength: 12 },
  { id: "cliente", label: "Cliente", section: "client", x: 195, y: 375, width: 1345, height: 53, type: "text", align: "left", fontSize: 28, maxLength: 90 },
  { id: "fone", label: "Fone", section: "client", x: 175, y: 429, width: 550, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 25 },
  { id: "celular", label: "Celular", section: "client", x: 840, y: 429, width: 700, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 25 },
  { id: "endereco", label: "Endereço", section: "client", x: 230, y: 477, width: 1310, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 100 },
  { id: "municipio", label: "Município", section: "client", x: 230, y: 529, width: 450, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 45 },
  { id: "uf", label: "UF", section: "client", x: 740, y: 524, width: 91, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 2 },
  { id: "cep", label: "CEP", section: "client", x: 918, y: 524, width: 622, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 10 },
  { id: "cnpjCpf", label: "CNPJ/CPF", section: "client", x: 240, y: 579, width: 485, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 18 },
  { id: "inscricaoEstadual", label: "Inscrição estadual", section: "client", x: 875, y: 579, width: 665, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 30 },
  { id: "email", label: "E-mail", section: "client", x: 185, y: 625, width: 1355, height: 48, type: "text", align: "left", fontSize: 28, maxLength: 100 },
];

const tableColumns: Array<{
  column: ProductColumn;
  left: number;
  right: number;
  type: FieldType;
  align: FieldDefinition["align"];
  maxLength: number;
}> = [
  { column: "descricao", left: 66, right: 532, type: "text", align: "left", maxLength: 55 },
  { column: "medida", left: 532, right: 710, type: "text", align: "left", maxLength: 24 },
  { column: "unidade", left: 710, right: 891, type: "text", align: "center", maxLength: 24 },
  { column: "fardo", left: 891, right: 978, type: "number", align: "right", maxLength: 8 },
  { column: "quantidade", left: 978, right: 1104, type: "number", align: "right", maxLength: 10 },
  { column: "valorUnitario", left: 1104, right: 1283, type: "currency", align: "right", maxLength: 18 },
  { column: "valorTotal", left: 1283, right: 1565, type: "currency", align: "right", maxLength: 22 },
];

export const PRODUCT_ROW_COUNT = 36;
const TABLE_TOP = 784;
const TABLE_BOTTOM = 2061;
const rowHeight = (TABLE_BOTTOM - TABLE_TOP) / PRODUCT_ROW_COUNT;

const productFields: FieldDefinition[] = Array.from(
  { length: PRODUCT_ROW_COUNT },
  (_, row) =>
    tableColumns.map(({ column, left, right, type, align, maxLength }) => ({
      id: `produto_${row}_${column}`,
      x: left + 5,
      y: TABLE_TOP + row * rowHeight + 2,
      width: right - left - 10,
      height: rowHeight - 4,
      type,
      align,
      fontSize: 27,
      maxLength,
      row,
      column,
      label: `Linha ${row + 1}, ${column}`,
    })),
).flat();

const footerFields: FieldDefinition[] = [
  { id: "condicaoPagamento", label: "Condição de pagamento", x: 460, y: 2065, width: 670, height: 58, type: "text", align: "left", fontSize: 28, maxLength: 55 },
  { id: "totalGeral", label: "Total geral", x: 1283, y: 2065, width: 282, height: 58, type: "currency", align: "right", fontSize: 31, maxLength: 24 },
  { id: "assinaturaVendedor", label: "Assinatura do vendedor", x: 115, y: 2152, width: 490, height: 32, type: "text", align: "center", fontSize: 30, maxLength: 50 },
  { id: "assinaturaComprador", label: "Assinatura do comprador", x: 995, y: 2146, width: 490, height: 32, type: "text", align: "center", fontSize: 30, maxLength: 50 },
];

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  ...personalFields,
  ...productFields,
  ...footerFields,
];

export const FIELD_BY_ID = new Map(FIELD_DEFINITIONS.map((field) => [field.id, field]));

export function productFieldId(row: number, column: ProductColumn) {
  return `produto_${row}_${column}`;
}
