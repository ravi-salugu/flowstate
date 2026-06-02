import type {
  PayloadContextChunk,
  TableCellRich,
  TableColumnDef,
  TablePayload,
  TableRow,
} from "@/lib/types/component";
import {
  expectArray,
  expectObject,
  expectString,
  expectStringOpt,
  type KindSpec,
} from "@/lib/components/KindRegistry";

function validateColumn(raw: unknown, i: number): TableColumnDef {
  const obj = expectObject(raw, `table.columns[${i}]`);
  return {
    key: expectString(obj.key, `table.columns[${i}].key`),
    label: expectString(obj.label, `table.columns[${i}].label`),
  };
}

function validateCell(raw: unknown, where: string): string | TableCellRich {
  if (typeof raw === "string") return raw;
  const obj = expectObject(raw, where);
  return {
    value: expectString(obj.value, `${where}.value`),
    badge: expectStringOpt(obj.badge, `${where}.badge`),
  };
}

function validateRow(raw: unknown, i: number): TableRow {
  const obj = expectObject(raw, `table.rows[${i}]`);
  const row: TableRow = {};
  for (const [k, v] of Object.entries(obj)) {
    row[k] = validateCell(v, `table.rows[${i}].${k}`);
  }
  return row;
}

function cellToString(c: string | TableCellRich): string {
  if (typeof c === "string") return c;
  return c.badge ? `${c.value} (${c.badge})` : c.value;
}

export const tableKindSpec: KindSpec<"table"> = {
  kind: "table",
  defaultSize: { w: 680, h: 480 },
  contextMimeTypes: ["text/markdown"],

  validate(raw: unknown): TablePayload {
    const obj = expectObject(raw, "table");
    return {
      kind: "table",
      columns: expectArray(obj.columns, "table.columns", validateColumn),
      rows: expectArray(obj.rows, "table.rows", validateRow),
    };
  },

  serializeForContext(payload: TablePayload): PayloadContextChunk[] {
    // GitHub-flavoured markdown table — the LLM parses this natively.
    const header = `| ${payload.columns.map((c) => c.label).join(" | ")} |`;
    const divider = `| ${payload.columns.map(() => "---").join(" | ")} |`;
    const body = payload.rows
      .map(
        (row) =>
          `| ${payload.columns
            .map((c) => cellToString(row[c.key] ?? ""))
            .join(" | ")} |`,
      )
      .join("\n");
    return [
      {
        mimeType: "text/markdown",
        text: [header, divider, body].join("\n"),
        caption: "Table",
      },
    ];
  },
};
