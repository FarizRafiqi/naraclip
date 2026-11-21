import React from 'react';
import { Composition } from 'remotion';
import { DevExplainer, DevExplainerProps } from './compositions/DevExplainer';

export const Root: React.FC = () => {
  return (
    <>
      <Composition<any, DevExplainerProps>
        id="DevExplainer"
        component={DevExplainer}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={({ props }) => {
          if (props?.shots && props.shots.length > 0) {
            const totalFrames = props.shots.reduce(
              (max, s) => Math.max(max, s.startFrame + s.durationInFrames),
              0
            );
            return { durationInFrames: Math.max(30, totalFrames) };
          }
          return { durationInFrames: 30 * 15 };
        }}
        defaultProps={{
          title: 'Bungkus Sekali. Jalan di Mana Saja.',
          accentColor: '#1D63ED',
          codeSnippet: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "index.js"]`,
          terminalCommands: [
            { cmd: 'docker build -t myapp .', output: 'exporting to image myapp:latest' },
            { cmd: 'docker run -d -p 8080:3000 myapp', output: 'Started container on :8080' },
          ],
        }}
      />
    </>
  );
};
