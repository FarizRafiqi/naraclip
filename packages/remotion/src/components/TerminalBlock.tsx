import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface CommandItem {
  cmd: string;
  output?: string | null;
}

interface CueItem {
  id: string;
  atMs: number;
  sfx?: string;
  label?: string;
}

interface TerminalBlockProps {
  title?: string;
  commands: CommandItem[];
  cues?: CueItem[];
  compact?: boolean;
  startFrame?: number;
  durationInFrames?: number;
}

const DOCKER_SUBCOMMANDS = new Set([
  'build',
  'run',
  'ps',
  'logs',
  'stop',
  'rm',
  'rmi',
  'pull',
  'push',
  'exec',
  'images',
  'compose',
  'up',
  'down',
  'network',
  'volume',
]);

function renderCommandTokens(visibleCmd: string): React.ReactNode {
  const parts = visibleCmd.split(/(\s+)/g);
  return parts.map((part, idx) => {
    if (/^\s+$/.test(part)) return part;
    if (part === 'docker' || part === '&&') {
      return (
        <span key={idx} style={{ color: '#5EA8FF', fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    if (DOCKER_SUBCOMMANDS.has(part)) {
      return (
        <span key={idx} style={{ color: '#F4EFE6', fontWeight: 700 }}>
          {part}
        </span>
      );
    }
    if (/^--?[a-zA-Z0-9-]+$/.test(part) || /^\d+:\d+$/.test(part)) {
      return (
        <span key={idx} style={{ color: '#F59E0B' }}>
          {part}
        </span>
      );
    }
    return (
      <span key={idx} style={{ color: '#E2DDD4' }}>
        {part}
      </span>
    );
  });
}

function renderOutputLines(output: string): React.ReactNode {
  const lines = output.split('\n');
  return lines.map((line, i) => {
    let color = '#C7D0DC';
    if (/\b(err|error|fail|failed|stopped|removed)\b/i.test(line)) {
      color = '#F97352';
    } else if (
      /(\[\+\]|✔|started|created|running|up |exporting|listening|pong|hit|built)/i.test(line)
    ) {
      color = '#34D399';
    }
    return (
      <div key={i} style={{ color }}>
        {line}
      </div>
    );
  });
}

export const TerminalBlock: React.FC<TerminalBlockProps> = ({
  title,
  commands,
  cues,
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

  const scale = interpolate(enter, [0, 1], [0.95, 1]);

  const count = Math.max(1, commands.length);
  const usableFrames = Math.max(36, durationInFrames - 12);
  const slotFrames = Math.floor(usableFrames / count);

  return (
    <div
      style={{
        width: '940px',
        background: '#171F2A',
        border: '2px solid #2A3444',
        borderRadius: '6px',
        boxShadow: '10px 10px 0 #090D12',
        overflow: 'hidden',
        transform: `scale(${scale})`,
      }}
    >
      {/* Minimal path prompt strip (no macOS dots, no generic uppercase shell title) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: compact ? '10px 24px' : '14px 26px',
          background: '#1E2734',
          borderBottom: '2px solid #2A3444',
          fontFamily: "'Noto Sans Mono', 'Liberation Mono', monospace",
          fontSize: '18px',
        }}
      >
        <span style={{ color: '#8E9BAE', fontWeight: 700 }}>
          {title ? title : '~/myapp'}
        </span>
      </div>

      {/* Terminal Body */}
      <div
        style={{
          padding: compact ? '20px 26px' : '28px 30px',
          fontFamily: "'Noto Sans Mono', 'Liberation Mono', monospace",
          fontSize: compact ? (count >= 3 ? '22px' : '27px') : count >= 3 ? '25px' : '30px',
          lineHeight: compact ? 1.45 : 1.55,
          color: '#F4EFE6',
        }}
      >
        {commands.map((c, i) => {
          // Prefer explicit cmd-1 / cmd-2 / cmd-3 cue timestamps when present in storyboard
          const cmdCue = cues?.find((q) => q.id === `cmd-${i + 1}`);
          const cmdStart = cmdCue ? Math.round((cmdCue.atMs / 1000) * fps) : 4 + i * slotFrames;
          const nextCue = cues?.find((q) => q.id === `cmd-${i + 2}`);
          const maxWindow = nextCue
            ? Math.max(14, Math.round((nextCue.atMs / 1000) * fps) - cmdStart - 2)
            : slotFrames;
          const typeDuration = Math.max(
            8,
            Math.min(Math.floor(maxWindow * 0.52), Math.ceil(c.cmd.length / 2.6))
          );

          const progress = interpolate(
            localFrame,
            [cmdStart, cmdStart + typeDuration],
            [0, c.cmd.length],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          const typedChars = Math.floor(progress);
          const visibleCmd = c.cmd.slice(0, typedChars);
          const isCmdVisible = localFrame >= cmdStart;
          const outputCue = cues?.find((q) => q.id === `out-${i + 1}`);
          const outputStart = outputCue
            ? Math.round((outputCue.atMs / 1000) * fps)
            : cmdStart + typeDuration + 3;
          const showOutput = localFrame >= outputStart;
          const outputOpacity = interpolate(localFrame, [outputStart, outputStart + 4], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          return (
            <div
              key={i}
              style={{
                marginBottom: i === commands.length - 1 ? 0 : compact ? '14px' : '22px',
                opacity: isCmdVisible ? 1 : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ color: '#5EA8FF', fontWeight: 700, flexShrink: 0 }}>$</span>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {renderCommandTokens(visibleCmd)}
                  {isCmdVisible && localFrame < outputStart && localFrame % 10 < 5 && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '24px',
                        backgroundColor: '#5EA8FF',
                        verticalAlign: 'middle',
                        marginLeft: '4px',
                      }}
                    />
                  )}
                </span>
              </div>
              {c.output && showOutput && (
                <div
                  style={{
                    marginLeft: '24px',
                    marginTop: '6px',
                    paddingLeft: '14px',
                    borderLeft: '3px solid #2A3444',
                    opacity: outputOpacity,
                    whiteSpace: 'pre-line',
                    fontSize: compact ? (count >= 3 ? '20px' : '24px') : count >= 3 ? '22px' : '26px',
                  }}
                >
                  {renderOutputLines(c.output)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
