import React, { useMemo } from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface SvgCue {
  id: string;
  atMs: number;
  sfx?: string;
  label?: string;
}

interface SvgDiagramProps {
  svg?: string;
  shotId?: string;
  cues?: SvgCue[];
  compact?: boolean;
  startFrame?: number;
  durationInFrames?: number;
}

export const SvgDiagram: React.FC<SvgDiagramProps> = ({
  svg,
  shotId = 'default',
  cues,
  compact = false,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - startFrame);
  const safeId = shotId.replace(/[^a-zA-Z0-9_-]/g, '');

  const scopedCss = useMemo(() => {
    const scope = `#svg-stage-${safeId}`;
    const popAt = (delay: number) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 18, stiffness: 190, mass: 0.6 },
      });
      const op = localFrame < delay ? 0 : Math.min(1, Math.max(0, p * 1.45));
      const sc = localFrame < delay ? 0.88 : interpolate(p, [0, 1], [0.88, 1]);
      const ty = localFrame < delay ? 14 : interpolate(p, [0, 1], [14, 0]);
      return `opacity: ${op.toFixed(3)}; transform-box: fill-box; transform-origin: center; transform: translateY(${ty.toFixed(2)}px) scale(${sc.toFixed(4)});`;
    };

    const slideUpAt = (delay: number) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 18, stiffness: 175, mass: 0.65 },
      });
      const op = localFrame < delay ? 0 : Math.min(1, Math.max(0, p * 1.45));
      const ty = localFrame < delay ? 32 : interpolate(p, [0, 1], [32, 0]);
      return `opacity: ${op.toFixed(3)}; transform: translateY(${ty.toFixed(2)}px);`;
    };

    const slideRightAt = (delay: number) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 18, stiffness: 175, mass: 0.65 },
      });
      const op = localFrame < delay ? 0 : Math.min(1, Math.max(0, p * 1.45));
      const tx = localFrame < delay ? -36 : interpolate(p, [0, 1], [-36, 0]);
      return `opacity: ${op.toFixed(3)}; transform: translateX(${tx.toFixed(2)}px);`;
    };

    const dropAt = (delay: number, dist = -72) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 16, stiffness: 180, mass: 0.75 },
      });
      const op = localFrame < delay ? 0 : Math.min(1, Math.max(0, p * 1.55));
      const ty = localFrame < delay ? dist : interpolate(p, [0, 1], [dist, 0]);
      return `opacity: ${op.toFixed(3)}; transform: translateY(${ty.toFixed(2)}px);`;
    };

    const stampAt = (delay: number) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 16, stiffness: 220, mass: 0.55 },
      });
      const op = localFrame < delay ? 0 : Math.min(1, p * 2.2);
      const sc = localFrame < delay ? 1.16 : interpolate(p, [0, 1], [1.16, 1]);
      const age = localFrame - delay;
      const sx =
        age >= 0 && age < 12 ? Math.sin(age * 2.4) * Math.exp(-age * 0.28) * 4 : 0;
      return `opacity: ${op.toFixed(3)}; transform-box: fill-box; transform-origin: center; transform: translateX(${sx.toFixed(2)}px) scale(${sc.toFixed(4)});`;
    };

    const drawAt = (delay: number, span = 20) => {
      const dash = interpolate(localFrame, [delay, delay + span], [900, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      });
      const op = localFrame < delay ? 0 : 1;
      return `opacity: ${op}; stroke-dasharray: 900; stroke-dashoffset: ${dash.toFixed(2)}px;`;
    };

    const hideAt = (delay: number) => {
      const p = spring({
        frame: localFrame - delay,
        fps,
        config: { damping: 15, stiffness: 200, mass: 0.5 },
      });
      const op = localFrame < delay ? 1 : Math.max(0, 1 - p * 1.4);
      const sc = localFrame < delay ? 1 : Math.max(0.55, 1 - p * 0.45);
      return `opacity: ${op.toFixed(3)}; transform-box: fill-box; transform-origin: center; transform: scale(${sc.toFixed(4)});`;
    };

    const dimAt = (delay: number) => {
      const p = interpolate(localFrame, [delay, delay + 6], [1, 0.35], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return `opacity: ${p.toFixed(3)};`;
    };

    // Word-anchored cue rules: data-cue, data-cue-slide, data-cue-drop, data-cue-stamp, data-cue-draw, data-cue-hide, data-cue-dim
    const cueCss = (cues ?? [])
      .map((cue) => {
        const delay = Math.max(0, Math.round((cue.atMs / 1000) * fps));
        const cid = cue.id.replace(/[^a-zA-Z0-9_-]/g, '');
        return `
          ${scope} [data-cue="${cid}"] { ${popAt(delay)} }
          ${scope} [data-cue-slide="${cid}"] { ${slideUpAt(delay)} }
          ${scope} [data-cue-right="${cid}"] { ${slideRightAt(delay)} }
          ${scope} [data-cue-drop="${cid}"] { ${dropAt(delay, -165)} }
          ${scope} [data-cue-stamp="${cid}"] { ${stampAt(delay)} }
          ${scope} [data-cue-draw="${cid}"] { ${drawAt(delay, 18)} }
          ${scope} [data-cue-hide="${cid}"] { ${hideAt(delay)} }
          ${scope} [data-cue-dim="${cid}"] { ${dimAt(delay)} }
        `;
      })
      .join('\n');

    // Dynamic physics helpers (arc-throw, seesaw, cube-spin, parallax waves, odometer)
    const throwStart = (() => {
      const c = cues?.find((q) => q.id === 'c-throw');
      return c ? Math.round((c.atMs / 1000) * fps) : 48;
    })();
    const arcT = interpolate(localFrame, [throwStart, throwStart + 18], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    });
    const arcX = arcT * 335;
    const arcY = arcT * 215 - Math.sin(arcT * Math.PI) * 115;

    // Seesaw beam tilt driven by c-vm1 / c-vm2 / c-cnt
    const vm1F = (() => {
      const c = cues?.find((q) => q.id === 'c-vm1');
      return c ? Math.round((c.atMs / 1000) * fps) : 58;
    })();
    const cntF = (() => {
      const c = cues?.find((q) => q.id === 'c-cnt');
      return c ? Math.round((c.atMs / 1000) * fps) : 120;
    })();
    const tiltDown = spring({
      frame: localFrame - vm1F,
      fps,
      config: { damping: 11, stiffness: 150, mass: 0.9 },
    });
    const tiltWin = spring({
      frame: localFrame - cntF,
      fps,
      config: { damping: 11, stiffness: 165, mass: 0.7 },
    });
    const seesawDeg = localFrame < vm1F ? -3 : -3 - tiltDown * 11 + tiltWin * 6;

    const cubeSpinCue = cues?.find((q) => q.id === 'c-docker');
    const cubeF = cubeSpinCue ? Math.round((cubeSpinCue.atMs / 1000) * fps) : 90;
    const cubeP = spring({
      frame: localFrame - cubeF,
      fps,
      config: { damping: 12, stiffness: 140, mass: 0.75 },
    });
    const cubeRot = localFrame < cubeF ? -90 : interpolate(cubeP, [0, 1], [-180, 0]);
    const cubeSc = localFrame < cubeF ? 0.3 : interpolate(cubeP, [0, 1], [0.4, 1]);
    const cubeOp = localFrame < cubeF ? 0 : Math.min(1, cubeP * 2);

    const odoCue = cues?.find((q) => q.id === 'c-2013');
    const odoF = odoCue ? Math.round((odoCue.atMs / 1000) * fps) : 125;
    const odoY = interpolate(localFrame, [odoF, odoF + 16], [90, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });

    const flowDash = -(localFrame * 3.4);
    const floatY = Math.sin(localFrame / 12) * 8;
    const wave1X = Math.sin(localFrame / 16) * 20;
    const wave2X = Math.cos(localFrame / 13) * 24;
    const pulseScale = 1 + Math.sin(localFrame / 8) * 0.045;
    const ledBlink = localFrame % 18 < 10 ? 1 : 0.35;

    // HDD Platter spin & actuator arm seek (s01): steady fast spin early, stutters under c-load/c-throw
    const loadCueF = (() => {
      const c = cues?.find((q) => q.id === 'c-load' || q.id === 'c-throw');
      return c ? Math.round((c.atMs / 1000) * fps) : 55;
    })();
    const diskStutter = localFrame >= loadCueF ? Math.sin((localFrame - loadCueF) * 1.45) * 16 : 0;
    const diskDeg = localFrame * 13 + diskStutter;
    const armSeekDeg =
      localFrame < loadCueF
        ? Math.sin(localFrame * 0.32) * 10
        : Math.sin(localFrame * 0.95) * 17 + Math.cos(localFrame * 2.1) * 5;

    // Stopwatch plunger click, slow sweep needle (DISK), fast snap needle (REDIS) (s04)
    const slowF = (() => {
      const c = cues?.find((q) => q.id === 'c-slowbar');
      return c ? Math.round((c.atMs / 1000) * fps) : 24;
    })();
    const fastF = (() => {
      const c = cues?.find((q) => q.id === 'c-fastbar');
      return c ? Math.round((c.atMs / 1000) * fps) : 45;
    })();
    const plungerP = spring({
      frame: localFrame,
      fps,
      config: { damping: 10, stiffness: 260, mass: 0.45 },
    });
    const plungerTy = localFrame < 14 ? Math.sin(Math.min(1, plungerP) * Math.PI) * 14 : 0;
    const slowSweepDeg = interpolate(localFrame, [slowF, slowF + 26], [0, 58], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
    const fastSnapP = spring({
      frame: Math.max(0, localFrame - fastF),
      fps,
      config: { damping: 11, stiffness: 210, mass: 0.55 },
    });
    const fastSweepDeg = localFrame < fastF ? 0 : interpolate(fastSnapP, [0, 1], [15, -58]);

    // Split-flap mechanical vertical fold (s07)
    const flapF = (() => {
      const c = cues?.find((q) => q.id === 'c-incr');
      return c ? Math.round((c.atMs / 1000) * fps) : 72;
    })();
    const flapDist = Math.abs(localFrame - (flapF + 3));
    const flapScaleY = localFrame >= flapF && flapDist < 6 ? 0.12 + (flapDist / 6) * 0.88 : 1;

    const drawDash = interpolate(localFrame, [8, 36], [900, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });

    return `
      ${scope} svg { width: 100%; height: 100%; overflow: visible; }
      ${scope} [data-anim="pop"] { ${popAt(3)} }
      ${scope} [data-anim="pop-1"] { ${popAt(4)} }
      ${scope} [data-anim="pop-2"] { ${popAt(14)} }
      ${scope} [data-anim="pop-3"] { ${popAt(24)} }
      ${scope} [data-anim="pop-4"] { ${popAt(34)} }
      ${scope} [data-anim="pop-5"] { ${popAt(44)} }
      ${scope} [data-anim="slide-up"] { ${slideUpAt(5)} }
      ${scope} [data-anim="slide-up-1"] { ${slideUpAt(6)} }
      ${scope} [data-anim="slide-up-2"] { ${slideUpAt(18)} }
      ${scope} [data-anim="slide-up-3"] { ${slideUpAt(30)} }
      ${scope} [data-anim="slide-right"] { ${slideRightAt(6)} }
      ${scope} [data-anim="drop"] { ${dropAt(14, -150)} }
      ${scope} [data-anim="arc-throw"] { transform: translate(${arcX.toFixed(2)}px, ${arcY.toFixed(2)}px); }
      ${scope} [data-anim="seesaw"] { transform: rotate(${seesawDeg.toFixed(2)}deg); }
      ${scope} [data-anim="disk-spin"] { transform-box: fill-box; transform-origin: center; transform: rotate(${diskDeg.toFixed(2)}deg); }
      ${scope} [data-anim="arm-seek"] { transform-box: fill-box; transform-origin: center; transform: rotate(${armSeekDeg.toFixed(2)}deg); }
      ${scope} [data-anim="plunger-press"] { transform: translateY(${plungerTy.toFixed(2)}px); }
      ${scope} [data-anim="needle-slow"] { transform-box: fill-box; transform-origin: center; transform: rotate(${slowSweepDeg.toFixed(2)}deg); }
      ${scope} [data-anim="needle-fast"] { transform-box: fill-box; transform-origin: center; transform: rotate(${fastSweepDeg.toFixed(2)}deg); }
      ${scope} [data-anim="flap-flip"] { transform-box: fill-box; transform-origin: center; transform: scaleY(${flapScaleY.toFixed(3)}); }
      ${scope} [data-anim="cube-spin"] { opacity: ${cubeOp.toFixed(3)}; transform-box: fill-box; transform-origin: center; transform: rotate(${cubeRot.toFixed(2)}deg) scale(${cubeSc.toFixed(4)}); }
      ${scope} [data-anim="odometer"] { transform: translateY(${odoY.toFixed(2)}px); }
      ${scope} [data-anim="draw"] { stroke-dasharray: 900; stroke-dashoffset: ${drawDash.toFixed(2)}px; }
      ${scope} [data-anim="flow"] { stroke-dashoffset: ${flowDash.toFixed(2)}px; }
      ${scope} [data-anim="float"] { transform-box: fill-box; transform-origin: center; transform: translateY(${floatY.toFixed(2)}px); }
      ${scope} [data-anim="wave-1"] { transform: translateX(${wave1X.toFixed(2)}px); }
      ${scope} [data-anim="wave-2"] { transform: translateX(${wave2X.toFixed(2)}px); }
      ${scope} [data-anim="pulse"] { transform-box: fill-box; transform-origin: center; transform: scale(${pulseScale.toFixed(4)}); }
      ${scope} [data-anim="led-blink"] { opacity: ${ledBlink}; }
      ${scope} [data-anim="shake"] { ${stampAt(46)} }
      ${cueCss}
    `;
  }, [safeId, cues, localFrame, fps]);

  return (
    <div
      id={`svg-stage-${safeId}`}
      style={{
        width: '980px',
        height: compact ? '540px' : '1120px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{scopedCss}</style>
      {svg ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <svg width="980" height={compact ? '540' : '1120'} viewBox="0 0 980 1120" fill="none">
          <g transform="translate(90, 260)">
            <g data-anim="pop-1">
              <rect x="8" y="8" width="800" height="520" rx="8" fill="#121820" />
              <rect width="800" height="520" rx="8" fill="#FFFFFF" stroke="#121820" strokeWidth="4" />
              <text
                x="400"
                y="270"
                textAnchor="middle"
                fill="#121820"
                fontSize="36"
                fontWeight="800"
                fontFamily="NaraDisplay, sans-serif"
              >
                SVG STAGE READY
              </text>
            </g>
          </g>
        </svg>
      )}
    </div>
  );
};
