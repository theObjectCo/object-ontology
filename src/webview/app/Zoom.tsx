import { useReactFlow, useViewport } from "@xyflow/react";
import { messages } from "../../shared/i18n";
import { ZoomControls } from "../panels";

export function Zoom({ t }: { t: ReturnType<typeof messages> }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <ZoomControls t={t} zoom={zoom} onIn={() => flow.zoomIn({ duration: 120 })} onOut={() => flow.zoomOut({ duration: 120 })}
      onFit={() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 200 })} />
  );
}
