import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUNDS_DIR = path.resolve(__dirname, 'public', 'Animated backgrounds');
const LOCAL_QURAN_DIR = path.resolve(__dirname, 'public', 'quran', 'husary-mujawwad');
const VIRTUAL_BG_ID = 'virtual:animated-backgrounds';
const RESOLVED_BG_ID = `\0${VIRTUAL_BG_ID}`;
const VIRTUAL_QURAN_ID = 'virtual:local-quran';
const RESOLVED_QURAN_ID = `\0${VIRTUAL_QURAN_ID}`;
const SUPPORTED_EXT = new Set(['.mp4', '.webm', '.gif']);

function scanLocalQuranFiles() {
  try {
    if (!fs.existsSync(LOCAL_QURAN_DIR)) return [];
    return fs
      .readdirSync(LOCAL_QURAN_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && /^\d{3}\.mp3$/i.test(e.name))
      .map((e) => Number(e.name.slice(0, 3)))
      .filter((n) => n >= 1 && n <= 114)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function formatFriendlyLabel(filename) {
  const base = filename
    .replace(/\.(mp4|webm|gif)$/i, '')
    .replace(/[-_]?wallsflow[-_]?com/gi, '')
    .replace(/[-_]?live[-_]?wallpaper/gi, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base || filename;
}

function scanAnimatedBackgrounds() {
  try {
    if (!fs.existsSync(BACKGROUNDS_DIR)) return [];
    const entries = fs.readdirSync(BACKGROUNDS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && SUPPORTED_EXT.has(path.extname(e.name).toLowerCase()))
      .map((e) => {
        const ext = path.extname(e.name).toLowerCase();
        return {
          id: e.name,
          filename: e.name,
          label: formatFriendlyLabel(e.name),
          ext,
          mediaType: ext === '.gif' ? 'image' : 'video',
          url: `./Animated%20backgrounds/${encodeURIComponent(e.name)}`,
        };
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));
  } catch {
    return [];
  }
}

function animatedBackgroundsPlugin() {
  return {
    name: 'jawoo-animated-backgrounds',
    resolveId(id) {
      if (id === VIRTUAL_BG_ID) return RESOLVED_BG_ID;
      if (id === VIRTUAL_QURAN_ID) return RESOLVED_QURAN_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_BG_ID) {
        const list = scanAnimatedBackgrounds();
        return `export default ${JSON.stringify(list, null, 2)};`;
      }
      if (id === RESOLVED_QURAN_ID) {
        const localSurahs = scanLocalQuranFiles();
        return `export default ${JSON.stringify(localSurahs)};`;
      }
      return null;
    },
    configureServer(server) {
      if (!fs.existsSync(BACKGROUNDS_DIR)) return;
      server.watcher.add(BACKGROUNDS_DIR);
      const reloadIfBg = (filePath) => {
        if (path.dirname(path.resolve(filePath)) === BACKGROUNDS_DIR) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_BG_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('add', reloadIfBg);
      server.watcher.on('unlink', reloadIfBg);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    animatedBackgroundsPlugin(),
    legacy({
      targets: ['chrome >= 49', 'safari >= 10', 'edge >= 15', 'android >= 5'],
      renderLegacyChunks: true,
      modernPolyfills: true,
    }),
  ],
  test: {
    environment: 'node',
    pool: 'threads',
    isolate: false,
    fileParallelism: false,
    testTimeout: 15000,
    include: ['src/tests/**/*.test.js'],
  },
});
