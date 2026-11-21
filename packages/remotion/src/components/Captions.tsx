import React, { useMemo } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

export type CaptionWord = {
  word: string;
  startMs: number;
  endMs: number;
};

export type CaptionBeat = {
  beatId: string;
  startMs: number;
  endMs: number;
};

interface CaptionsProps {
  words?: CaptionWord[];
  beats?: CaptionBeat[];
  theme: 'paper' | 'ink';
  highlightColor?: string;
}

type PhraseChunk = {
  words: CaptionWord[];
  startMs: number;
  endMs: number;
};

function findBeatIndex(ms: number, beats?: CaptionBeat[]): number {
  if (!beats || beats.length === 0) return -1;
  for (let i = 0; i < beats.length; i++) {
    if (ms >= beats[i].startMs && ms <= beats[i].endMs) return i;
  }
  return -1;
}

function buildChunks(words: CaptionWord[], beats?: CaptionBeat[]): PhraseChunk[] {
  if (!words || words.length === 0) return [];
  const chunks: PhraseChunk[] = [];
  let buf: CaptionWord[] = [];
  let charCount = 0;
  let bufBeat = findBeatIndex(words[0].startMs, beats);

  const flush = () => {
    if (buf.length === 0) return;
    chunks.push({
      words: buf,
      startMs: buf[0].startMs,
      endMs: buf[buf.length - 1].endMs,
    });
    buf = [];
    charCount = 0;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wBeat = findBeatIndex(w.startMs, beats);
    const nextLen = charCount + (buf.length > 0 ? 1 : 0) + w.word.length;
    const gapMs = buf.length > 0 ? w.startMs - buf[buf.length - 1].endMs : 0;

    if (
      buf.length > 0 &&
      (buf.length >= 4 || nextLen > 25 || (wBeat !== -1 && wBeat !== bufBeat) || gapMs > 280)
    ) {
      flush();
      bufBeat = wBeat;
    }

    if (buf.length === 0) bufBeat = wBeat;
    buf.push(w);
    charCount += (buf.length > 1 ? 1 : 0) + w.word.length;

    if (/[.!?,;:]$/.test(w.word.trim())) {
      flush();
    }
  }
  flush();

  // Fill micro-gaps between chunks inside the same beat so captions never blink awkwardly
  for (let i = 0; i < chunks.length - 1; i++) {
    const cur = chunks[i];
    const nxt = chunks[i + 1];
    const gap = nxt.startMs - cur.endMs;
    if (gap > 0 && gap <= 320 && findBeatIndex(cur.startMs, beats) === findBeatIndex(nxt.startMs, beats)) {
      cur.endMs = nxt.startMs;
    }
  }
  if (chunks.length > 0) {
    chunks[chunks.length - 1].endMs += 250;
  }
  return chunks;
}

export const Captions: React.FC<CaptionsProps> = ({
  words = [],
  beats,
  theme,
  highlightColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const chunks = useMemo(() => buildChunks(words, beats), [words, beats]);

  const activeChunkIndex = chunks.findIndex((c) => timeMs >= c.startMs && timeMs < c.endMs);
  if (activeChunkIndex === -1) return null;

  const chunk = chunks[activeChunkIndex];
  const chunkEnterFrame = (chunk.startMs / 1000) * fps;
  const pop = spring({
    frame: Math.max(0, frame - chunkEnterFrame),
    fps,
    config: { damping: 14, stiffness: 200, mass: 0.5 },
  });

  const isInk = theme === 'ink';
  const baseColor = isInk ? '#F4EFE6' : '#121820';
  const strokeColor = isInk ? '#121820' : '#F4EFE6';
  const activeColor = highlightColor || (isInk ? '#5EA8FF' : '#1D63ED');

  return (
    <div
      style={{
        position: 'absolute',
        left: '105px',
        width: '870px',
        top: '1350px',
        zIndex: 50,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'baseline',
        columnGap: '18px',
        rowGap: '8px',
        textAlign: 'center',
        pointerEvents: 'none',
        transform: `translateY(${(1 - pop) * 10}px)`,
      }}
    >
      {chunk.words.map((w, idx) => {
        const isSpoken = timeMs >= w.startMs && timeMs <= w.endMs + 40;
        const wordPop = isSpoken
          ? spring({
              frame: Math.max(0, frame - (w.startMs / 1000) * fps),
              fps,
              config: { damping: 12, stiffness: 220, mass: 0.4 },
            })
          : 0;

        return (
          <span
            key={`${activeChunkIndex}-${idx}`}
            style={{
              display: 'inline-block',
              fontFamily: "'NaraDisplay', 'Liberation Sans', sans-serif",
              fontSize: '52px',
              fontWeight: 900,
              lineHeight: 1.16,
              letterSpacing: '-0.015em',
              color: isSpoken ? activeColor : baseColor,
              WebkitTextStroke: `7px ${strokeColor}`,
              paintOrder: 'stroke fill',
              transform: isSpoken ? `scale(${1 + wordPop * 0.07})` : 'scale(1)',
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
