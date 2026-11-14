// Works channel CLI for people and agents: list the TVs, or add one work folder (works/README.md).
//   npm run works -- list
//   npm run works -- add --title "名稱" --preview shot.gif [--summary ...] [--tags "n8n,LLM"]
//                        [--href https://...] [--link-label ...] [--frame console|portable|monitor] [--slug name]
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { collectWorks } from '../src/v3/works.js';

const WORKS = fileURLToPath(new URL('../works/', import.meta.url));
const FRAMES = ['console', 'portable', 'monitor'];
const PREVIEWS = ['.gif', '.webp', '.png', '.jpg'];
const MAX_PREVIEW = 1.5 * 1024 * 1024;
const OPTIONS = Object.fromEntries(['title', 'preview', 'summary', 'tags', 'href', 'link-label', 'frame', 'slug'].map((name) => [name, { type: 'string' }]));

const folders = (dir) => readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();

export const listWorks = (dir = WORKS) => folders(dir).map((folder) => ({ folder, title: JSON.parse(readFileSync(join(dir, folder, 'work.json'), 'utf8')).title }));

// Validates with the site's own collectWorks, then writes works/NN-slug/ after the last folder, so the
// new work becomes the last channel, right before the transition TV.
export function addWork(dir, options) {
  const ext = extname(options.preview ?? '').toLowerCase().replace('.jpeg', '.jpg');
  if (!PREVIEWS.includes(ext)) throw new Error('--preview must be a .gif, .webp, .png or .jpg file; convert videos first (works/README.md)');
  const { size } = statSync(options.preview);
  const tags = options.tags?.split(',').map((tag) => tag.trim()).filter(Boolean);
  const data = Object.fromEntries(Object.entries({
    title: options.title?.trim(),
    summary: options.summary?.trim(),
    tags,
    href: options.href?.trim(),
    linkLabel: options['link-label']?.trim(),
    frame: options.frame,
  }).filter(([, value]) => value?.length));
  const [work] = collectWorks({ '/works/new/work.json': data }, { '/works/new/preview.gif': options.preview });
  if (!work) throw new Error('--title is required');
  if (data.href && !work.href) throw new Error('--href must start with https:// or mailto: and contain no spaces, quotes or angle brackets');
  if (data.frame && !FRAMES.includes(data.frame)) throw new Error(`--frame must be one of ${FRAMES.join(', ')}`);
  if (tags?.length > 5) throw new Error('--tags: the TV shows at most 5 tags');
  const last = Math.max(0, ...folders(dir).map((name) => parseInt(name, 10)).filter(Number.isFinite));
  const slug = (options.slug ?? data.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work';
  const folder = `${String(last + 1).padStart(2, '0')}-${slug}`;
  const target = join(dir, folder);
  mkdirSync(target);
  try {
    copyFileSync(options.preview, join(target, `preview${ext}`));
    writeFileSync(join(target, 'work.json'), `${JSON.stringify(data, null, 2)}\n`);
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
  return { folder, size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'list') {
      listWorks().forEach(({ folder, title }, i) => console.log(`CH ${String(i + 1).padStart(2, '0')}  ${folder}  ${title}`));
    } else if (command === 'add') {
      const { folder, size } = addWork(WORKS, parseArgs({ args, options: OPTIONS }).values);
      console.log(`Added works/${folder}; it is now the last channel. Run npm test.`);
      if (size > MAX_PREVIEW) console.warn(`The preview is ${(size / 1048576).toFixed(1)} MB; keep it under 1.5 MB (works/README.md).`);
    } else {
      console.log('Usage: npm run works -- list | add --title <text> --preview <file> [--summary] [--tags a,b] [--href] [--link-label] [--frame] [--slug]');
      process.exitCode = command ? 1 : 0;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
