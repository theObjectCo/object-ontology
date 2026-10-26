import { useEffect } from "react";
import { EditorLinkKind } from "../../core/links";
import { LINK_WORDS, Messages } from "../../shared/i18n";

export interface LinkMenuProps {
  t: Messages;
  language: string;
  x: number;
  y: number;
  kinds: EditorLinkKind[];
  /** For an effect that starts at a state: the states it can change to. */
  effectTargets?: string[];
  onPick: (kind: EditorLinkKind, toState?: string) => void;
  onCancel: () => void;
}

export const LINK_SYMBOL: Record<EditorLinkKind, string> = {
  agent: "●", instrument: "○", consumption: "→", result: "→", effect: "↔", condition: "○c", event: "○e",
  invocation: "⌇→", aggregation: "▲", exhibition: "◭", generalization: "△", tagged: "⇢",
};

export function LinkMenu(p: LinkMenuProps) {
  const words = LINK_WORDS[p.language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const items: { kind: EditorLinkKind; toState?: string; text: string }[] = [];
  for (const k of p.kinds) {
    if (k === "effect" && p.effectTargets?.length) for (const s of p.effectTargets) items.push({ kind: k, toState: s, text: `${words[k]} → ${s}` });
    else items.push({ kind: k, text: words[k] ?? k });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); p.onCancel(); }
      const n = Number(e.key);
      if (n >= 1 && n <= Math.min(9, items.length)) { e.preventDefault(); p.onPick(items[n - 1].kind, items[n - 1].toState); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  return (
    <div className="opm-linkmenu" style={{ left: p.x, top: p.y }}>
      <div className="opm-linkmenu-head">{p.t.chooseLinkKind}</div>
      {items.map((it, i) => (
        <button key={`${it.kind}-${it.toState ?? ""}`} onClick={() => p.onPick(it.kind, it.toState)}>
          <span className="opm-symbol">{LINK_SYMBOL[it.kind]}</span> {it.text} <span className="opm-dim">{i < 9 ? i + 1 : ""}</span>
        </button>
      ))}
      <div className="opm-dim opm-linkmenu-foot">{p.t.escCancel}</div>
    </div>
  );
}
