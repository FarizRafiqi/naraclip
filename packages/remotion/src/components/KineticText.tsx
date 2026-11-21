import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface KineticTextProps {
  text: string;
  delayFrames?: number;
  highlightWords?: string[];
  highlightColor?: string;
  fontSize?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  delayFrames = 0,
  highlightWords = [],
  highlightColor = '#1D63ED',
  fontSize = 68,
  color = '#121820',
  align = 'center',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent:
          align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        columnGap: '16px',
        rowGap: '8px',
        width: '100%',
        textAlign: align,
      }}
    >
      {words.map((w, i) => {
        const wordDelay = delayFrames + i * 3;
        const progress = spring({
          frame: frame - wordDelay,
          fps,
          config: { damping: 13, mass: 0.6, stiffness: 160 },
        });

        const normalizedWord = w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const isHighlight = highlightWords.some(
          (hw) => hw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalizedWord
        );

        const opacity = Math.min(1, Math.max(0, progress));
        const translateY = (1 - progress) * 26;

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontSize: `${fontSize}px`,
              fontWeight: 900,
              lineHeight: 1.08,
              fontFamily: "'NaraDisplay', 'Liberation Sans', sans-serif",
              color: isHighlight ? highlightColor : color,
              opacity,
              transform: `translateY(${translateY}px)`,
              letterSpacing: '-0.025em',
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
