import { Config } from '@remotion/cli/config';

// 1080x1920 9:16 vertical video default for shorts/reels
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(18);
