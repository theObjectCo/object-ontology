import { Fragment } from "react";
import { entryText } from "../../core/methods/common";
import { Dsm } from "../../core/methods/dsm";
import { Party, Sipoc } from "../../core/methods/sipoc";
import { Model, label } from "../../core/model";
import { format } from "../../shared/i18n";
import { MethodMessages } from "./messages";

function partyText(model: Model, p: Party, t: MethodMessages): string {
  if (p.kind === "outside") return t.outside;
  return p.kind === "environment" ? `${label(model, p.id)} (${t.environment})` : label(model, p.id);
}

/** The five SIPOC columns; each row holds one input with its suppliers and one output with its customers. */
export function SipocView({ model, s, t }: { model: Model; s: Sipoc; t: MethodMessages }) {
  const steps = s.steps.length ? s.steps.map((p, i) => `${i + 1}. ${label(model, p)}`) : [label(model, s.process)];
  const rows = Math.max(s.inputs.length, s.outputs.length, steps.length);
  const parties = (list?: Party[]) => list?.map((p) => (
    <div key={p.kind === "outside" ? "outside" : p.id} className={p.kind === "outside" ? "opm-dim" : undefined}>{partyText(model, p, t)}</div>
  ));
  return (
    <table className="opm-m-table opm-m-sipoc">
      <thead><tr><th>{t.suppliers}</th><th>{t.inputs}</th><th>{t.process}</th><th>{t.outputs}</th><th>{t.customers}</th></tr></thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td>{parties(s.inputs[i]?.suppliers)}</td>
            <td>{s.inputs[i] && entryText(model, s.inputs[i].entry, t.words)}</td>
            <td className="opm-m-step">{steps[i]}</td>
            <td>{s.outputs[i] && entryText(model, s.outputs[i].entry, t.words)}</td>
            <td>{parties(s.outputs[i]?.customers)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The matrix with numbered columns; cells of one cycle share a tint, and feedback below the diagonal is marked. */
export function DsmView({ model, d, t }: { model: Model; d: Dsm; t: MethodMessages }) {
  const cycleOf = new Map(d.cycles.flatMap((g, i) => g.map((id) => [id, i] as const)));
  return (
    <>
      <table className="opm-m-table opm-m-dsm">
        <thead>
          <tr><th />{d.order.map((id, i) => <th key={id} title={label(model, id)}>{i + 1}</th>)}</tr>
        </thead>
        <tbody>
          {d.order.map((a, i) => (
            <tr key={a}>
              <th>{i + 1}. {label(model, a)}</th>
              {d.order.map((b, j) => {
                if (a === b) return <td key={b} className="opm-m-diagonal" />;
                const list = d.cells[a][b] ?? [];
                const inCycle = cycleOf.has(a) && cycleOf.get(a) === cycleOf.get(b);
                const cls = [list.length ? "filled" : "", inCycle ? "cycle" : "", list.length && j < i ? "feedback" : ""].filter(Boolean).join(" ");
                return (
                  <td key={b} className={cls || undefined} title={list.length ? `${label(model, a)} → ${label(model, b)}` : undefined}>
                    {list.map((o, k) => <Fragment key={o}>{k > 0 && <br />}{label(model, o)}</Fragment>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{d.cycles.length ? format(t.cycles, { list: d.cycles.map((g) => g.map((id) => label(model, id)).join(" ⇄ ")).join("; ") }) : t.noCycles}</p>
    </>
  );
}
