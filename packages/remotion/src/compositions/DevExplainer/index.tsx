import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { GridBackground } from '../../components/GridBackground';
import { KineticText } from '../../components/KineticText';
import { TerminalBlock } from '../../components/TerminalBlock';
import { CodeBlock, type CodeAnnotation, type HighlightStep } from '../../components/CodeBlock';
import { SvgDiagram, type SvgCue } from '../../components/SvgDiagram';
import { ShotStage, type CameraKeyframe } from '../../components/ShotStage';
import { Captions, type CaptionBeat, type CaptionWord } from '../../components/Captions';

export type CommandItem = {
  cmd: string;
  output?: string | null;
};

export type ShotItem = {
  id: string;
  startFrame: number;
  durationInFrames: number;
  recipe: 'kinetic-title' | 'code' | 'terminal' | 'custom-svg' | 'stat-callout';
  headline?: string | null;
  body?: string | null;
  code?: string | null;
  terminal?: CommandItem[] | null;
  svg?: string | null;
  motion?: string;
  emphasis?: string[];
  highlightSteps?: HighlightStep[];
  cues?: SvgCue[];
  camera?: CameraKeyframe[];
  transitionIn?: 'ink-wipe' | 'slide-push' | 'stamp-cut' | 'none';
  annotations?: CodeAnnotation[];
};

export type DevExplainerProps = {
  title: string;
  subtitle?: string;
  accentColor?: string;
  audioSrc?: string;
  words?: CaptionWord[];
  beats?: CaptionBeat[];
  codeSnippet?: string;
  terminalCommands?: CommandItem[];
  shots?: ShotItem[];
};

export const DevExplainer: React.FC<DevExplainerProps> = ({
  title,
  accentColor = '#1D63ED',
  audioSrc,
  words = [],
  beats = [],
  codeSnippet = '',
  terminalCommands = [],
  shots,
}) => {
  const frame = useCurrentFrame();

  const resolvedShots: ShotItem[] =
    shots && shots.length > 0
      ? shots
      : [
          {
            id: 'demo-svg',
            startFrame: 0,
            durationInFrames: 150,
            recipe: 'custom-svg',
            motion: 'pop',
            emphasis: [],
          },
          {
            id: 'demo-code',
            startFrame: 150,
            durationInFrames: 150,
            recipe: 'code',
            headline: 'Dockerfile',
            code: codeSnippet,
            motion: 'slide-up',
            emphasis: [],
          },
          {
            id: 'demo-term',
            startFrame: 300,
            durationInFrames: 150,
            recipe: 'terminal',
            terminal: terminalCommands,
            motion: 'pop',
            emphasis: [],
          },
        ];

  const activeShot =
    resolvedShots.find(
      (s) => frame >= s.startFrame && frame < s.startFrame + s.durationInFrames
    ) ?? resolvedShots[resolvedShots.length - 1];

  const activeTheme: 'paper' | 'ink' =
    activeShot?.recipe === 'code' || activeShot?.recipe === 'terminal' ? 'ink' : 'paper';

  const resolvedAudioSrc = audioSrc
    ? audioSrc.startsWith('http') || audioSrc.startsWith('data:')
      ? audioSrc
      : staticFile(audioSrc)
    : undefined;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: activeTheme === 'ink' ? '#121820' : '#F4EFE6',
        color: activeTheme === 'ink' ? '#F4EFE6' : '#121820',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'NaraDisplay';
          src: url('${staticFile('fonts/Outfit-Black.ttf')}') format('truetype');
          font-weight: 900;
          font-style: normal;
        }
        @font-face {
          font-family: 'NaraSans';
          src: url('${staticFile('fonts/Roboto-Bold.ttf')}') format('truetype');
          font-weight: 700;
          font-style: normal;
        }
      `}</style>

      <GridBackground variant={activeTheme} />

      {resolvedShots.map((shot, idx) => {
        const hasCompanionSvg =
          Boolean(shot.svg) && (shot.recipe === 'code' || shot.recipe === 'terminal');

        return (
          <Sequence
            key={shot.id}
            from={shot.startFrame}
            durationInFrames={shot.durationInFrames}
          >
            <ShotStage
              motion={shot.motion || 'pop'}
              durationInFrames={shot.durationInFrames}
              isLastShot={idx === resolvedShots.length - 1}
              camera={shot.camera}
              transitionIn={shot.transitionIn}
            >
              {shot.recipe === 'custom-svg' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '130px',
                    left: '50px',
                    width: '980px',
                    height: '1120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SvgDiagram
                    svg={shot.svg || undefined}
                    shotId={shot.id}
                    cues={shot.cues}
                    startFrame={0}
                    durationInFrames={shot.durationInFrames}
                  />
                </div>
              )}

              {shot.recipe === 'code' && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: hasCompanionSvg ? '125px' : '180px',
                      left: '70px',
                      width: '940px',
                      height: hasCompanionSvg ? '555px' : '1060px',
                      display: 'flex',
                      alignItems: hasCompanionSvg ? 'flex-start' : 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CodeBlock
                      code={shot.code || codeSnippet || '// empty'}
                      title={shot.headline || undefined}
                      highlightSteps={shot.highlightSteps}
                      annotations={shot.annotations}
                      compact={hasCompanionSvg}
                      startFrame={0}
                      durationInFrames={shot.durationInFrames}
                    />
                  </div>
                  {hasCompanionSvg && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '705px',
                        left: '50px',
                        width: '980px',
                        height: '540px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <SvgDiagram
                        svg={shot.svg || undefined}
                        shotId={`${shot.id}-comp`}
                        cues={shot.cues}
                        compact={true}
                        startFrame={0}
                        durationInFrames={shot.durationInFrames}
                      />
                    </div>
                  )}
                </>
              )}

              {shot.recipe === 'terminal' && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: hasCompanionSvg ? '125px' : '180px',
                      left: '70px',
                      width: '940px',
                      height: hasCompanionSvg ? '540px' : '1060px',
                      display: 'flex',
                      alignItems: hasCompanionSvg ? 'flex-start' : 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <TerminalBlock
                      title={shot.headline || undefined}
                      commands={shot.terminal || terminalCommands || []}
                      cues={shot.cues}
                      compact={hasCompanionSvg}
                      startFrame={0}
                      durationInFrames={shot.durationInFrames}
                    />
                  </div>
                  {hasCompanionSvg && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '695px',
                        left: '50px',
                        width: '980px',
                        height: '540px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <SvgDiagram
                        svg={shot.svg || undefined}
                        shotId={`${shot.id}-comp`}
                        cues={shot.cues}
                        compact={true}
                        startFrame={0}
                        durationInFrames={shot.durationInFrames}
                      />
                    </div>
                  )}
                </>
              )}

              {shot.recipe === 'stat-callout' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '220px',
                    left: '90px',
                    width: '900px',
                    height: '960px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '96px',
                      height: '8px',
                      backgroundColor: '#D94426',
                      marginBottom: '28px',
                    }}
                  />
                  <KineticText
                    text={shot.headline || title}
                    highlightWords={shot.emphasis || []}
                    highlightColor={accentColor}
                    fontSize={76}
                    color="#121820"
                    align="left"
                  />
                  {shot.body && (
                    <div
                      style={{
                        marginTop: '36px',
                        paddingTop: '28px',
                        borderTop: '3px solid #121820',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        fontFamily: "'NaraSans', 'Liberation Sans', sans-serif",
                        fontSize: '30px',
                        lineHeight: 1.35,
                        color: '#344050',
                      }}
                    >
                      {shot.body.split('|').map((part, pIdx) => (
                        <div
                          key={pIdx}
                          style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
                        >
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: accentColor,
                              flexShrink: 0,
                            }}
                          />
                          <span>{part.trim()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {shot.recipe === 'kinetic-title' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '230px',
                    left: '90px',
                    width: '900px',
                    height: '960px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '110px',
                      height: '10px',
                      backgroundColor: accentColor,
                      marginBottom: '32px',
                    }}
                  />
                  <KineticText
                    text={shot.headline || title}
                    highlightWords={shot.emphasis || []}
                    highlightColor={accentColor}
                    fontSize={84}
                    color="#121820"
                    align="left"
                  />
                  {shot.body && (
                    <div
                      style={{
                        marginTop: '40px',
                        paddingTop: '24px',
                        borderTop: '3px solid #121820',
                        fontFamily: "'Noto Sans Mono', 'Liberation Mono', monospace",
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#5B6572',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {shot.body}
                    </div>
                  )}
                </div>
              )}
            </ShotStage>
          </Sequence>
        );
      })}

      <Captions
        words={words}
        beats={beats}
        theme={activeTheme}
        highlightColor={activeTheme === 'ink' ? '#5EA8FF' : accentColor}
      />

      {resolvedAudioSrc && <Audio src={resolvedAudioSrc} />}
    </AbsoluteFill>
  );
};
