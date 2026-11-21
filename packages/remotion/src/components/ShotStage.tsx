import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface CameraKeyframe {
  atMs: number;
  x: number;
  y: number;
  scale: number;
}

export interface ShotStageProps {
  motion: string;
  durationInFrames: number;
  isLastShot?: boolean;
  camera?: CameraKeyframe[];
  transitionIn?: 'ink-wipe' | 'slide-push' | 'stamp-cut' | 'none';
  children: React.ReactNode;
}

function interpolateCamera(
  keyframes: CameraKeyframe[] | undefined,
  localFrame: number,
  fps: number
): { x: number; y: number; scale: number } {
  if (!keyframes || keyframes.length === 0) return { x: 0, y: 0, scale: 1 };
  const sorted = [...keyframes].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 1) return { x: sorted[0].x, y: sorted[0].y, scale: sorted[0].scale };

  const currentMs = (localFrame / fps) * 1000;
  if (currentMs <= sorted[0].atMs) {
    return { x: sorted[0].x, y: sorted[0].y, scale: sorted[0].scale };
  }
  const last = sorted[sorted.length - 1];
  if (currentMs >= last.atMs) {
    return { x: last.x, y: last.y, scale: last.scale };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (currentMs >= a.atMs && currentMs <= b.atMs) {
      const span = Math.max(1, b.atMs - a.atMs);
      const t = Easing.inOut(Easing.cubic)((currentMs - a.atMs) / span);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
      };
    }
  }
  return { x: 0, y: 0, scale: 1 };
}

export const ShotStage: React.FC<ShotStageProps> = ({
  motion,
  durationInFrames,
  camera,
  transitionIn = 'none',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 180, mass: 0.6 },
  });

  // Compute subtle, critically-damped shot-level transitions (no harsh overshoot or dim fade)
  let stageTx = 0;
  let stageTy = 0;
  let stageScale = 1;

  if (transitionIn === 'slide-push') {
    stageTx = interpolate(enterSpring, [0, 1], [56, 0]);
  } else if (transitionIn === 'stamp-cut') {
    stageScale = interpolate(enterSpring, [0, 1], [1.04, 1]);
  } else {
    switch (motion) {
      case 'pop':
        stageScale = interpolate(enterSpring, [0, 1], [0.96, 1]);
        break;
      case 'slide-up':
        stageTy = interpolate(enterSpring, [0, 1], [32, 0]);
        break;
      case 'slide-left':
        stageTx = interpolate(enterSpring, [0, 1], [40, 0]);
        break;
      case 'push-in':
        stageScale = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.0, 1.045], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'pull-out':
        stageScale = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.05, 1.0], {
          extrapolateRight: 'clamp',
        });
        break;
      default:
        break;
    }
  }

  const cam = interpolateCamera(camera, frame, fps);
  const totalTx = stageTx + cam.x;
  const totalTy = stageTy + cam.y;
  const totalScale = stageScale * cam.scale;

  // Hard-edged printing block ink wipe overlay (frames 0..8)
  const showWipe = transitionIn === 'ink-wipe' && frame < 9;
  const wipeX = showWipe
    ? interpolate(frame, [0, 8], [-1150, 1180], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.inOut(Easing.cubic),
      })
    : 0;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translate(${totalTx.toFixed(2)}px, ${totalTy.toFixed(2)}px) scale(${totalScale.toFixed(4)})`,
          transformOrigin: '50% 42%',
        }}
      >
        {children}
      </AbsoluteFill>
      {showWipe && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '1080px',
            transform: `translateX(${wipeX.toFixed(1)}px)`,
            pointerEvents: 'none',
            zIndex: 40,
            display: 'flex',
          }}
        >
          <div style={{ width: '160px', height: '100%', backgroundColor: '#1D63ED' }} />
          <div style={{ flex: 1, height: '100%', backgroundColor: '#121820' }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
