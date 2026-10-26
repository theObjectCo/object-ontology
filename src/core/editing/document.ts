import { Model } from "../model";
import { EditError, JsonPath } from "./contracts";
import { Node, findNodeAtLocation, findNodeAtOffset, getNodeValue, parseTree } from "jsonc-parser";

/** The indentation unit of a document, e.g. two spaces. */
export function indentUnit(text: string): string {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1] : "  ";
}

/** One-line JSON in the style of the example models: { "a": 1 }, ["x", "y"], [40, 290]. */
export function compact(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

export const MAX_LINE = 120;

/** The order of the top-level sections; a new section goes before the first later one already in the file. */
export const SECTIONS = ["$schema", "name", "description", "objects", "processes", "views", "stories", "layout"];

/**
 * A JSON document edited in place. Every change touches only the text of the affected entry, so the
 * formatting of the rest of the file stays as it is: an entry written on one line stays on one line,
 * a multi-line object gets new lines with the indentation of its neighbours.
 */
export class Doc {
  text: string;
  private unit: string;
  private eol: string;

  constructor(text: string) {
    this.text = text.trim() ? text : "{\n}\n";
    this.unit = indentUnit(this.text);
    this.eol = this.text.includes("\r\n") ? "\r\n" : "\n";
    const tree = parseTree(this.text);
    if (!tree || tree.type !== "object") throw new EditError("The file is not a JSON object; fix it in the text editor first.");
  }

  get model(): Model {
    return JSON.parse(this.text) as Model;
  }

  node(path: JsonPath): Node | undefined {
    const tree = parseTree(this.text)!;
    return path.length ? findNodeAtLocation(tree, path) : tree;
  }

  value<T = unknown>(path: JsonPath): T | undefined {
    const n = this.node(path);
    return n ? (getNodeValue(n) as T) : undefined;
  }

  private replace(offset: number, length: number, s: string) {
    this.text = this.text.slice(0, offset) + s + this.text.slice(offset + length);
  }

  private lineIndent(offset: number): string {
    const start = this.text.lastIndexOf("\n", offset - 1) + 1;
    return /^[ \t]*/.exec(this.text.slice(start))![0];
  }

  private column(offset: number): number {
    return offset - (this.text.lastIndexOf("\n", offset - 1) + 1);
  }

  private isMultiline(n: Node): boolean {
    return this.text.slice(n.offset, n.offset + n.length).includes("\n");
  }

  /**
   * Text of a value that starts at a column: one line if it fits or if forced; otherwise one entry per line,
   * each entry again on one line if it fits, as in the example models.
   */
  private render(value: unknown, column: number, indent: string, oneLine: boolean): string {
    const flat = compact(value);
    if (oneLine || column + flat.length <= MAX_LINE || typeof value !== "object" || value === null) return flat;
    const inner = indent + this.unit;
    const lines = Array.isArray(value)
      ? value.map((v) => inner + this.render(v, inner.length, inner, false))
      : Object.entries(value as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => {
          const key = JSON.stringify(k);
          return `${inner}${key}: ${this.render(x, inner.length + key.length + 2, inner, false)}`;
        });
    if (!lines.length) return flat;
    const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
    return `${open}${this.eol}${lines.join("," + this.eol)}${this.eol}${indent}${close}`;
  }

  /**
   * After a change at an offset: when its line grew past the limit, the outermost one-line object or array on
   * that line around the offset is written again, with one entry per line where the entries do not fit.
   */
  private reflow(offset: number) {
    const start = this.text.lastIndexOf("\n", offset - 1) + 1;
    const nl = this.text.indexOf("\n", offset);
    if (this.text.slice(start, nl < 0 ? this.text.length : nl).trimEnd().length <= MAX_LINE) return;
    let outer: Node | undefined;
    for (let n: Node | undefined = findNodeAtOffset(parseTree(this.text)!, offset); n; n = n.parent) {
      if (n.type !== "object" && n.type !== "array") continue;
      if (n.offset < start || this.isMultiline(n)) break;
      outer = n;
    }
    if (outer) this.replace(outer.offset, outer.length, this.render(getNodeValue(outer), this.column(outer.offset), this.lineIndent(outer.offset), false));
  }

  set(path: JsonPath, value: unknown) {
    if (value === undefined) return this.remove(path);
    const oneLine = path[0] === "layout" && path.length >= 2;
    const existing = this.node(path);
    if (existing) {
      const col = this.column(existing.offset);
      this.replace(existing.offset, existing.length, this.render(value, col, this.lineIndent(existing.offset), oneLine));
      if (!oneLine) this.reflow(existing.offset);
      return;
    }
    const parentPath = path.slice(0, -1);
    const key = path[path.length - 1];
    if (!this.node(parentPath)) this.set(parentPath, typeof key === "number" ? [] : {});
    const parent = this.node(parentPath)!;
    if (parent.type === "array") return this.insertItem(parent, value, oneLine);
    if (!parentPath.length && this.insertSection(parent, String(key), value)) return;
    this.insertProperty(parent, String(key), value, parentPath.length <= 1, oneLine);
  }

  push(path: JsonPath, value: unknown) {
    const list = this.node(path);
    if (list?.type === "array") this.insertItem(list, value, path[0] === "layout");
    else this.set(path, [value]);
  }

  private insertProperty(obj: Node, key: string, value: unknown, multilineWhenEmpty: boolean, oneLine: boolean) {
    const props = obj.children ?? [];
    const k = JSON.stringify(key);
    const entry = (indent: string, col: number) => `${k}: ${this.render(value, col + k.length + 2, indent, oneLine)}`;
    if (!props.length) {
      if (multilineWhenEmpty || this.isMultiline(obj)) {
        const outer = this.lineIndent(obj.offset);
        const indent = outer + this.unit;
        return this.replace(obj.offset, obj.length, `{${this.eol}${indent}${entry(indent, indent.length)}${this.eol}${outer}}`);
      }
      // a one-line container takes the entry on one line, and reflow wraps the line if it grew too long
      this.replace(obj.offset, obj.length, `{ ${k}: ${compact(value)} }`);
      if (!oneLine) this.reflow(obj.offset + 2);
      return;
    }
    const last = props[props.length - 1];
    const end = last.offset + last.length;
    if (this.isMultiline(obj)) {
      const indent = this.lineIndent(last.offset);
      this.replace(end, 0, `,${this.eol}${indent}${entry(indent, indent.length)}`);
    } else {
      this.replace(end, 0, `, ${k}: ${compact(value)}`);
      if (!oneLine) this.reflow(end + 2);
    }
  }

  /** Inserts a top-level section before the first section that follows it in SECTIONS; false if there is none. */
  private insertSection(root: Node, key: string, value: unknown): boolean {
    const rank = SECTIONS.indexOf(key);
    if (rank < 0 || !this.isMultiline(root)) return false;
    const next = (root.children ?? []).find((p) => SECTIONS.indexOf(String(p.children![0].value)) > rank);
    if (!next) return false;
    const indent = this.lineIndent(next.offset);
    const k = JSON.stringify(key);
    this.replace(next.offset, 0, `${k}: ${this.render(value, indent.length + k.length + 2, indent, false)},${this.eol}${indent}`);
    return true;
  }

  private insertItem(list: Node, value: unknown, oneLine: boolean) {
    const items = list.children ?? [];
    if (!items.length) {
      this.replace(list.offset, list.length, `[${compact(value)}]`);
      if (!oneLine) this.reflow(list.offset + 1);
      return;
    }
    const last = items[items.length - 1];
    const end = last.offset + last.length;
    if (this.isMultiline(list)) {
      const indent = this.lineIndent(last.offset);
      this.replace(end, 0, `,${this.eol}${indent}${this.render(value, indent.length, indent, oneLine)}`);
    } else {
      this.replace(end, 0, `, ${compact(value)}`);
      if (!oneLine) this.reflow(end + 2);
    }
  }

  /** Removes a property or an array item together with the comma that separates it from a neighbour. */
  remove(path: JsonPath) {
    const n = this.node(path);
    if (!n?.parent) return;
    const target = n.parent.type === "property" ? n.parent : n;
    const container = target.parent!;
    const siblings = container.children!;
    const i = siblings.indexOf(target);
    if (siblings.length === 1) return this.replace(container.offset, container.length, container.type === "array" ? "[]" : "{}");
    if (i < siblings.length - 1) return this.replace(target.offset, siblings[i + 1].offset - target.offset, "");
    const prev = siblings[i - 1];
    this.replace(prev.offset + prev.length, target.offset + target.length - (prev.offset + prev.length), "");
  }

  renameKey(path: JsonPath, newKey: string) {
    const n = this.node(path);
    if (!n?.parent || n.parent.type !== "property") return;
    const key = n.parent.children![0];
    this.replace(key.offset, key.length, JSON.stringify(newKey));
  }

  replaceString(path: JsonPath, s: string) {
    const n = this.node(path);
    if (n?.type === "string") this.replace(n.offset, n.length, JSON.stringify(s));
  }
}
