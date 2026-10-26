import { Sentence } from "../../core/opl";

export function SentenceView({ s, selected, onClick }: { s: Sentence; selected: Set<string>; onClick: (refs: string[]) => void }) {
  const hot = s.refs.some((r) => selected.has(r));
  return (
    <span className={`opm-sentence${hot ? " hot" : ""}`} onClick={() => onClick(s.refs)}>
      {s.tokens.map((tk, i) => ("thing" in tk ? <b key={i}>{tk.text}</b> : "state" in tk ? <i key={i}>{tk.text}</i> : <span key={i}>{tk.text}</span>))}
    </span>
  );
}
