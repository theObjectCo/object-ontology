import { Messages } from "../../shared/i18n";

export function ZoomControls({ zoom, onIn, onOut, onFit, t }: { zoom: number; onIn: () => void; onOut: () => void; onFit: () => void; t: Messages }) {
  return (
    <div className="opm-zoom">
      <button onClick={onOut} aria-label="Zoom out">−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={onIn} aria-label="Zoom in">+</button>
      <button onClick={onFit} title={t.fit}>⤢</button>
    </div>
  );
}
