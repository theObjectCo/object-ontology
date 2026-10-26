import { useEffect, useRef } from "react";
import { Messages } from "../../shared/i18n";
import { Sentence } from "../../core/opl";
import { SentenceView } from "./SentenceView";

export interface OplProps {
  t: Messages;
  sentences: Sentence[];
  expanded: boolean;
  mode: "view" | "selection";
  selectionActive: boolean;
  selected: Set<string>;
  onToggle: () => void;
  onMode: (m: "view" | "selection") => void;
  onSelect: (refs: string[]) => void;
}

export function OplBar(p: OplProps) {
  const text = p.sentences.map((s) => s.tokens.map((t) => t.text).join("")).join(" ");
  const list = useRef<HTMLDivElement>(null);
  // the first sentence about the selection scrolls into view
  useEffect(() => {
    list.current?.querySelector(".hot")?.scrollIntoView({ block: "nearest" });
  }, [p.selected, p.expanded]);
  if (!p.expanded) {
    return (
      <div className="opm-opl collapsed">
        <button className="opm-opl-toggle" onClick={p.onToggle}>▸ {p.t.opl}</button>
        <div className="opm-opl-line">
          {p.sentences.slice(0, 3).map((s, i) => <SentenceView key={i} s={s} selected={p.selected} onClick={p.onSelect} />)}
          {p.sentences.length > 3 && <span className="opm-dim"> …</span>}
        </div>
        <span className="opm-dim">{p.selectionActive ? p.t.selectionOnly.toLowerCase() : `${p.sentences.length} ${p.t.sentences}`}</span>
      </div>
    );
  }
  return (
    <div className="opm-opl expanded">
      <div className="opm-opl-head">
        <button className="opm-opl-toggle" onClick={p.onToggle}>▾ {p.t.opl}</button>
        <div className="opm-seg">
          <button className={p.mode === "view" ? "on" : ""} onClick={() => p.onMode("view")}>{p.t.wholeView}</button>
          <button className={p.mode === "selection" ? "on" : ""} onClick={() => p.onMode("selection")}>{p.t.selectionOnly}</button>
        </div>
        <button className="link" onClick={() => navigator.clipboard?.writeText(text)}>{p.t.copy}</button>
      </div>
      <div className="opm-opl-list" ref={list}>
        {p.sentences.map((s, i) => <div key={i}><SentenceView s={s} selected={p.selected} onClick={p.onSelect} /></div>)}
      </div>
    </div>
  );
}
