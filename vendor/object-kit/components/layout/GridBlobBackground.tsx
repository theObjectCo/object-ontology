import React, { useEffect, useRef } from 'react';
import { mountGridBlobSvg } from './gridBlobSvg';

export const GridBlobBackground: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.52 });
  const animationFrameRef = useRef<number | null>(null);
  // start < 0 oznacza brak impulsu
  const pulseRef = useRef({ start: -1 });

  useEffect(() => mountGridBlobSvg(
    svgRef, groupRef, pointerRef, animationFrameRef, pulseRef,
  ), []);

  return (
    <svg ref={svgRef} className="grid-blob-svg" aria-hidden="true">
      <g ref={groupRef} fill="#fff" />
    </svg>
  );
};

export default GridBlobBackground;
