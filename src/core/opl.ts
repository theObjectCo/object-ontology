import { Model, ProcessDef, Ref, affiliation, essence, label, objects, processes, refIds, refObject, refState } from "./model";

export type Token = { text: string } | { thing: string; text: string } | { state: string; text: string };

export interface Sentence {
  tokens: Token[];
  /** Things the sentence is about; clicking the sentence selects them. */
  refs: string[];
}

export function sentenceText(s: Sentence): string {
  return s.tokens.map((t) => t.text).join("");
}

class Builder {
  tokens: Token[] = [];
  refs = new Set<string>();
  constructor(private model: Model) {}
  t(text: string) { this.tokens.push({ text }); return this; }
  thing(id: string) { this.refs.add(id); this.tokens.push({ thing: id, text: label(this.model, id) }); return this; }
  state(s: string) { this.tokens.push({ state: s, text: s }); return this; }
  /** A, B and C, each an identifier. */
  list(ids: string[]) { ids.forEach((id, i) => { if (i) this.t(i === ids.length - 1 ? " and " : ", "); this.thing(id); }); return this; }
  /** A, s B and C: references with optional states in front of the object. */
  refs_(rs: Ref[]) {
    rs.forEach((r, i) => {
      if (i) this.t(i === rs.length - 1 ? " and " : ", ");
      const s = refState(r);
      if (s) this.state(s).t(" ");
      this.thing(refObject(r));
    });
    return this;
  }
  done(): Sentence { return { tokens: merge(this.tokens), refs: [...this.refs] }; }
}

function merge(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && "text" in last && !("thing" in last) && !("state" in last) && !("thing" in t) && !("state" in t)) last.text += t.text;
    else out.push({ ...t });
  }
  return out;
}

/** OPL sentences of the whole model, following the ISO 19450 patterns. */
export function oplSentences(model: Model): Sentence[] {
  const out: Sentence[] = [];
  const b = () => new Builder(model);
  const objs = Object.entries(objects(model));
  const modules = objs.filter(([, o]) => o.role === "module").map(([id]) => id);
  if (modules.length) out.push(b().list(modules).t(modules.length > 1 ? " are modules." : " is a module.").done());
  for (const [id, o] of objs) {
    const traits = [essence(o) === "physical" ? "physical" : "", affiliation(o) === "environmental" ? "environmental" : ""].filter(Boolean);
    if (traits.length) out.push(b().thing(id).t(` is ${traits.join(" and ")}.`).done());
    if (o.states?.length) {
      const s = b().thing(id).t(" can be ");
      o.states.forEach((st, i) => { if (i) s.t(i === o.states!.length - 1 ? " or " : ", "); s.state(st); });
      out.push(s.t(".").done());
    }
    if (o.consistsOf?.length) out.push(b().thing(id).t(" consists of ").list(refIds(o.consistsOf)).t(".").done());
    if (o.exhibits?.length) out.push(b().thing(id).t(" exhibits ").list(refIds(o.exhibits)).t(".").done());
    if (o.isA) out.push(b().thing(id).t(" is a ").thing(refObject(o.isA)).t(".").done());
    for (const tg of o.tagged ?? []) out.push(b().thing(id).t(` ${tg.tag} `).thing(tg.object).t(".").done());
  }
  for (const [id, p] of Object.entries(processes(model))) out.push(...processSentences(model, id, p));
  return out;
}

function processSentences(model: Model, id: string, p: ProcessDef): Sentence[] {
  const b = () => new Builder(model);
  const out: Sentence[] = [];
  const traits = [essence(p) === "physical" ? "physical" : "", affiliation(p) === "environmental" ? "environmental" : ""].filter(Boolean);
  if (traits.length) out.push(b().thing(id).t(` is ${traits.join(" and ")}.`).done());
  if (p.handledBy?.length) out.push(b().list(refIds(p.handledBy)).t(p.handledBy.length > 1 ? " handle " : " handles ").thing(id).t(".").done());
  if (p.requires?.length) out.push(b().thing(id).t(" requires ").refs_(p.requires).t(".").done());
  if (p.consumes?.length) out.push(b().thing(id).t(" consumes ").refs_(p.consumes).t(".").done());
  if (p.yields?.length) out.push(b().thing(id).t(" yields ").refs_(p.yields).t(".").done());
  if (p.affects?.length) out.push(b().thing(id).t(" affects ").list(refIds(p.affects)).t(".").done());
  for (const c of p.changes ?? []) {
    const s = b().thing(id).t(" changes ").thing(c.object);
    if (c.from) s.t(" from ").state(c.from);
    out.push(s.t(" to ").state(c.to).t(".").done());
  }
  for (const c of p.conditions ?? []) {
    const s = b().thing(id).t(" occurs if ").thing(c.object);
    if (c.state) s.t(" is ").state(c.state); else s.t(" exists");
    out.push(s.t(", otherwise ").thing(id).t(" is skipped.").done());
  }
  for (const e of p.events ?? []) {
    const s = b();
    if (e.state) s.state(e.state).t(" ");
    out.push(s.thing(e.object).t(" initiates ").thing(id).t(".").done());
  }
  if (p.zoomsInto?.length) out.push(b().thing(id).t(" zooms into ").list(p.zoomsInto).t(p.zoomsInto.length > 1 ? ", in that sequence." : ".").done());
  if (p.invokes?.length) out.push(b().thing(id).t(" invokes ").list(refIds(p.invokes)).t(".").done());
  if (p.consistsOf?.length) out.push(b().thing(id).t(" consists of ").list(refIds(p.consistsOf)).t(".").done());
  if (p.isA) out.push(b().thing(id).t(" is a ").thing(refObject(p.isA)).t(".").done());
  return out;
}

/** Sentences about any of the given things. */
export function oplAbout(model: Model, ids: Iterable<string>): Sentence[] {
  const set = new Set(ids);
  return oplSentences(model).filter((s) => s.refs.some((r) => set.has(r)));
}

/** Sentences whose things all appear in a view. */
export function oplOfView(model: Model, shown: Iterable<string>): Sentence[] {
  const set = new Set(shown);
  return oplSentences(model).filter((s) => s.refs.every((r) => set.has(r)));
}
