

export function Toast({ text, error }: { text: string; error?: boolean }) {
  return <div className={`opm-toast${error ? " error" : ""}`} role="status">{text}</div>;
}
