import { ReactNode } from "react";

// The Markdown subset of notes (paragraphs, line breaks, "- " lists, `code`, **bold**, [text](target) links
// and bare http(s) addresses), rendered as React elements without parsing any HTML.

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string, onLink: (href: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = out.length;
    const [, code, bold, linkText, linkHref, bare] = m;
    if (code !== undefined) out.push(<code key={key}>{code}</code>);
    else if (bold !== undefined) out.push(<b key={key}>{bold}</b>);
    else {
      const href = linkHref ?? bare!;
      out.push(
        <a key={key} href={href} title={href} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLink(href); }}>
          {linkText ?? bare}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ""), onLink)}</li>)}</ul>;
        }
        return (
          <p key={i}>
            {lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, onLink)}</span>)}
          </p>
        );
      })}
    </>
  );
}
