import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';

// Resolve at config-eval time on the build host. ffmpegPath is the
// absolute path to the ffmpeg binary inside node_modules/ffmpeg-static
// for the host platform — Forge will copy it into Resources/ at package
// time. The cast is because the package's TS types declare the export
// as the union string|null even though it's always a string at runtime
// when the postinstall succeeded.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBundledPath = require('ffmpeg-static') as string;

const config: ForgeConfig = {
  packagerConfig: {
    // App bundle icon — Forge auto-picks the right extension per platform:
    // .icns on macOS, .ico on Windows, .png on Linux. Pass without extension.
    icon: './resources/icon',
    asar: {
      // hyperframes ships an ESM CLI + native deps that don't load from
      // inside an asar archive when spawned as a child process.
      // ffmpeg-static stores its binary inside node_modules; same story.
      unpack:
        '**/{node_modules/hyperframes,node_modules/ffmpeg-static}/**',
    },
    // Bundled runtime dependencies — see src/main/binaries.ts for the
    // resolution side. ffmpeg + chrome-headless-shell ship inside the
    // app so users don't need brew/winget/apt install steps. Node is
    // not bundled separately; we spawn Electron itself with
    // ELECTRON_RUN_AS_NODE=1 (requires the RunAsNode fuse below).
    extraResource: [
      './resources/defaults',
      ffmpegBundledPath, // → Resources/ffmpeg (or ffmpeg.exe on Windows)
      './resources/chrome', // → Resources/chrome/chrome-headless-shell/...
      './resources/icon.png', // → Resources/icon.png (runtime BrowserWindow icon)
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: 'Jellypod-Inc', name: 'cartoon-studio' },
      prerelease: false,
      draft: true,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Electron Fuses — flipped at package time. RunAsNode must be true
    // so ELECTRON_RUN_AS_NODE=1 works for the hyperframes child process
    // (saves bundling a separate Node binary, ~30-50 MB).
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
