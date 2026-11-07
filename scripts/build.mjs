import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { pageHTML } from '../src/html.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

async function bundle(entry, globalName) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, minify: true,
    format: 'iife', globalName, write: false, platform: 'browser',
    target: ['chrome109', 'firefox128', 'safari17'],
    legalComments: 'inline', loader: { '.adf': 'json' },
  });
  return result.outputFiles[0].text.trim();
}

const [css, content, runtime, capture] = await Promise.all([
  read('../src/style.css'),
  read('../src/viewer-shell.html'),
  bundle('src/viewer.js'),
  bundle('src/capture.js', 'ADFPageCapture'),
]);

const licenses = await read('../THIRD_PARTY_NOTICES.md');
const notices = `\n/*! Bundled dependencies\n${licenses.replaceAll('*/', '* /')}\n*/\n`;
const viewer = pageHTML({ css, content, runtime: notices + runtime, title: 'ADF Viewer', mode: 'viewer' });
await Promise.all([
  writeFile(new URL('../docs/index.html', import.meta.url), viewer),
  writeFile(new URL('../extension/capture.js', import.meta.url), notices + capture + '\n'),
]);
console.log('Built docs/index.html and extension/capture.js');
