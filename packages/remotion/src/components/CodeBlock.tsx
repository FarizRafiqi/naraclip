import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface HighlightStep {
  line: number;
  atMs: number;
}

export interface CodeAnnotation {
  line: number;
  text: string;
  atMs: number;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  highlightLine?: number;
  highlightSteps?: HighlightStep[];
  annotations?: CodeAnnotation[];
  compact?: boolean;
  startFrame?: number;
  durationInFrames?: number;
}

const KEYWORDS = new Set([
  'FROM',
  'WORKDIR',
  'COPY',
  'RUN',
  'EXPOSE',
  'CMD',
  'ENV',
  'ENTRYPOINT',
  'ARG',
  'ADD',
  'USER',
  'VOLUME',
  'LABEL',
  'services',
  'image',
  'ports',
  'volumes',
  'environment',
  'depends_on',
  'build',
  'const',
  'let',
  'await',
  'async',
  'return',
  'import',
  'export',
  'from',
]);

function detectFileTitle(code: string, explicitTitle?: string, language?: string): string {
  if (explicitTitle && explicitTitle.trim()) return explicitTitle.trim();
  if (/^\s*FROM\s+/m.test(code)) return 'Dockerfile';
  if (/^\s*services\s*:/m.test(code)) return 'compose.yaml';
  return language || 'code';
}

function renderTokenizedLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>{line}</span>;
  }

  const parts = line.split(/("[^"]*"|'[^']*'|\s+)/g).filter((p) => p !== '');
  return parts.map((part, i) => {
    if (/^\s+$/.test(part)) return part;
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return (
        <span key={i} style={{ color: '#34D399' }}>
          {part}
        </span>
      );
    }
    const clean = part.replace(/[:,[\]]/g, '');
    if (KEYWORDS.has(clean) || KEYWORDS.has(part)) {
      return (
        <span key={i} style={{ color: '#5EA8FF', fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    if (/^(--?[a-zA-Z0-9-]+|:\d+.*|\d+(?::\d+)?)$/.test(part) || /:[0-9a-zA-Z.-]+$/.test(part)) {
      return (
        <span key={i} style={{ color: '#F59E0B' }}>
          {part}
        </span>
      );
    }
    return (
      <span key={i} style={{ color: '#F4EFE6' }}>
        {part}
      </span>
    );
  });
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  title,
  highlightLine,
  highlightSteps,
  annotations,
  compact = false,
  startFrame = 0,
  durationInFrames = 150,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - startFrame);

  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, mass: 0.75, stiffness: 150 },
  });

  const lines = code.trim().split('\n');
  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const fontSize = compact
    ? lines.length > 8
      ? 23
      : 26
    : lines.length > 9 || maxLineLen > 38
      ? 26
      : 30;
  const headerTitle = detectFileTitle(code, title, language);

  // Stagger base lines fast so content is legible immediately, leaving room for word-synced highlights
  const revealSpan = Math.max(10, Math.min(24, Math.floor(durationInFrames * 0.2)));
  const perLineDelay = lines.length > 1 ? revealSpan / lines.length : 0;

  const codeLineIndices = lines
    .map((l, idx) => ({ l: l.trim(), idx }))
    .filter((x) => x.l.length > 0 && !x.l.startsWith('#') && !x.l.startsWith('//'))
    .map((x) => x.idx);

  let activeIdx = highlightLine ? highlightLine - 1 : -1;
  if (!highlightLine && highlightSteps && highlightSteps.length > 0) {
    const sorted = [...highlightSteps].sort((a, b) => a.atMs - b.atMs);
    for (const step of sorted) {
      const stepFrame = Math.round((step.atMs / 1000) * fps);
      if (localFrame >= stepFrame) {
        activeIdx = step.line - 1;
      }
    }
  } else if (!highlightLine && codeLineIndices.length > 0) {
    const scanStart = revealSpan * 0.6;
    const scanEnd = Math.max(scanStart + 18, durationInFrames - 10);
    const pos = Math.floor(
      interpolate(localFrame, [scanStart, scanEnd], [0, codeLineIndices.length - 0.01], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    );
    activeIdx = codeLineIndices[Math.max(0, Math.min(codeLineIndices.length - 1, pos))];
  }

  return (
    <div
      style={{
        width: '940px',
        background: '#171F2A',
        border: '2px solid #2A3444',
        borderRadius: '6px',
        boxShadow: '10px 10px 0 #090D12',
        overflow: 'hidden',
        transform: `translateY(${(1 - enter) * 20}px)`,
      }}
    >
      {/* Minimal file tab strip (no uppercase tracked fluff or macOS dots) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: compact ? '12px 24px' : '15px 26px',
          background: '#1E2734',
          borderBottom: '2px solid #2A3444',
          fontFamily: "'Noto Sans Mono', 'Liberation Mono', monospace",
          fontSize: '20px',
        }}
      >
        <span style={{ color: '#F4EFE6', fontWeight: 700, letterSpacing: '0.01em' }}>
          {headerTitle}
        </span>
      </div>

      {/* Code Lines */}
      <div
        style={{
          padding: compact ? '18px 0' : '26px 0',
          fontFamily: "'Noto Sans Mono', 'Liberation Mono', monospace",
          fontSize: `${fontSize}px`,
          lineHeight: compact ? 1.55 : 1.72,
        }}
      >
        {lines.map((line, idx) => {
          const lineSpring = spring({
            frame: localFrame - idx * perLineDelay,
            fps,
            config: { damping: 16, stiffness: 200, mass: 0.45 },
          });
          const isHighlighted = idx === activeIdx;
          const ann = annotations?.find((a) => a.line === idx + 1);
          const annFrame = ann ? Math.round((ann.atMs / 1000) * fps) : -1;
          const annSpring =
            ann && localFrame >= annFrame
              ? spring({
                  frame: localFrame - annFrame,
                  fps,
                  config: { damping: 13, stiffness: 210, mass: 0.5 },
                })
              : 0;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: compact ? '4px 24px' : '6px 26px',
                background: isHighlighted ? 'rgba(94, 168, 255, 0.16)' : 'transparent',
                borderLeft: isHighlighted ? '5px solid #5EA8FF' : '5px solid transparent',
                opacity: Math.min(1, Math.max(0, lineSpring)),
                transform: `translateX(${(1 - lineSpring) * 14}px)`,
              }}
            >
              {/* #8E9BAE on #171F2A = 4.92:1 contrast (passes WCAG AA 4.5:1) */}
              <span
                style={{
                  width: '40px',
                  flexShrink: 0,
                  color: isHighlighted ? '#5EA8FF' : '#8E9BAE',
                  textAlign: 'right',
                  paddingRight: '18px',
                  fontWeight: isHighlighted ? 700 : 500,
                }}
              >
                {idx + 1}
              </span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {renderTokenizedLine(line)}
              </span>
              {ann && annSpring > 0.02 && (
                <span
                  style={{
                    flexShrink: 0,
                    marginLeft: '14px',
                    padding: '4px 12px',
                    backgroundColor: '#128067',
                    color: '#F4EFE6',
                    borderRadius: '4px',
                    border: '2px solid #34D399',
                    fontFamily: "'NaraSans', 'Liberation Sans', sans-serif",
                    fontSize: '18px',
                    fontWeight: 700,
                    opacity: Math.min(1, annSpring * 1.4),
                    transform: `translateX(${(1 - annSpring) * 18}px)`,
                  }}
                >
                  {ann.text}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
