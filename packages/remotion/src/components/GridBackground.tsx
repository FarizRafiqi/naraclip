import React from 'react';

export interface GridBackgroundProps {
  variant?: 'paper' | 'ink';
  glowColor?: string;
  gridSize?: number;
}

/**
 * Dual-theme studio surface backdrop:
 * - `paper`: Warm archival paper (#F4EFE6) with subtle edge depth vignette (zero slop grids/orbs).
 * - `ink`: Matte charcoal ink (#121820) for Code & Shell plates.
 */
export const GridBackground: React.FC<GridBackgroundProps> = ({
  variant = 'paper',
}) => {
  const isInk = variant === 'ink';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: isInk ? '#121820' : '#F4EFE6',
        overflow: 'hidden',
      }}
    >
      {/* Subtle organic edge vignette for print framing */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isInk
            ? 'radial-gradient(ellipse 85% 78% at 50% 45%, transparent 55%, rgba(6, 9, 13, 0.55) 100%)'
            : 'radial-gradient(ellipse 85% 78% at 50% 45%, transparent 62%, rgba(212, 202, 186, 0.45) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
