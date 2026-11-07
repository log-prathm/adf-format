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

const [css, content, runtime, capture, paperCSS, paperShell, paperRuntime] = await Promise.all([
  read('../src/style.css'),
  read('../src/viewer-shell.html'),
  bundle('src/viewer.js'),
  bundle('src/capture.js', 'ADFPageCapture'),
  read('../src/paged.css'),
  read('../src/paged-shell.html'),
  bundle('src/paged.js'),
]);

const licenses = await read('../THIRD_PARTY_NOTICES.md');
const notices = `\n/*! Bundled dependencies\n${licenses.replaceAll('*/', '* /')}\n*/\n`;
const reader = '<main id="reader" class="reader"></main>';
const readerSwitch = '<!-- reader-switch -->';
if (!content.includes(reader) || !content.includes(readerSwitch)) throw new Error('Missing viewer shell insertion point.');
const viewer = pageHTML({
  css, content: content.replace(readerSwitch, '<a class="view-switch" href="./reader.html">Open page reader</a>'),
  runtime: notices + runtime, title: 'ADF Viewer', mode: 'viewer',
});
const importer = content.replace(reader, '')
  .replace('Offline document viewer', 'PDF-style reader')
  .replace('Open an ADF document', 'Read ADF in pages')
  .replace('Read, convert, and share interactive documents.', 'Read on white pages with an outline, thumbnails, and document search.')
  .replace(readerSwitch, '<a class="view-switch" href="./index.html">Open classic viewer</a>');
const paged = pageHTML({
  css: css + '\n' + paperCSS,
  content: paperShell.replace('<!-- importer -->', importer),
  runtime: notices + paperRuntime, title: 'ADF Page Reader', mode: 'paged',
});
await Promise.all([
  writeFile(new URL('../docs/index.html', import.meta.url), viewer),
  writeFile(new URL('../docs/reader.html', import.meta.url), paged),
  writeFile(new URL('../extension/capture.js', import.meta.url), notices + capture + '\n'),
]);
console.log('Built docs/index.html, docs/reader.html, and extension/capture.js');
