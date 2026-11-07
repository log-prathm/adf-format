import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { MAX_BYTES, parseADF, serializeADF } from '../src/format.js';
import { portableHTML, readAssets } from '../src/html.js';
import { fromConversation, fromMarkdown, parseExport } from '../src/import.js';

const help = `Agentic Document Format 1.0

  npm run adf -- validate FILE.adf
  npm run adf -- render FILE.adf [OUTPUT.html]
  npm run adf -- import-markdown INPUT.md [OUTPUT.adf]
  npm run adf -- list-chatgpt INPUT.json
  npm run adf -- import-chatgpt INPUT.json [OUTPUT.adf] [--conversation N]

Conversation numbers start at 1. Run npm run build to refresh the bundled viewer.
`;

async function readInput(file) {
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Expected a local input file up to 32 MiB.');
  return readFile(file, 'utf8');
}

function argumentsFor(args) {
  const [command, input, ...rest] = args;
  const flags = rest.indexOf('--conversation');
  let conversation;
  if (flags >= 0 && command === 'import-chatgpt') {
    const [, number] = rest.splice(flags, 2);
    if (!/^\d+$/.test(number ?? '') || !Number.isSafeInteger(Number(number)) || Number(number) < 1) {
      throw new Error('--conversation expects a positive integer.');
    }
    conversation = Number(number);
  }
  const [output] = rest;
  if (!input || rest.length > 1 || output?.startsWith('--') || (output && ['validate', 'list-chatgpt'].includes(command))) {
    throw new Error('Invalid arguments. Run npm run adf -- --help.');
  }
  return { command, input, output, conversation };
}

async function main(args) {
  if (!args.length || ['-h', '--help'].includes(args[0])) {
    console.log(help);
    return;
  }
  const { command, input, output, conversation } = argumentsFor(args);
  const stem = input.slice(0, -extname(input).length || undefined);
  const inputText = await readInput(input);
  async function save(file, text) {
    if (resolve(file) === resolve(input)) throw new Error('Choose a different output path from the input file.');
    await writeFile(file, text, { flag: 'wx' });
    console.log(`Wrote ${file}`);
  }
  switch (command) {
    case 'validate':
      console.log(`Valid ADF 1.0 · ${parseADF(inputText).title}`);
      break;
    case 'render': {
      const assets = readAssets(await readFile(new URL('../docs/index.html', import.meta.url), 'utf8'));
      await save(output ?? `${stem}.html`, portableHTML(parseADF(inputText), assets));
      break;
    }
    case 'import-markdown':
      await save(output ?? `${stem}.adf`, serializeADF(fromMarkdown(inputText, basename(stem))));
      break;
    case 'list-chatgpt':
      parseExport(inputText).forEach(({ title }, i) => console.log(`${i + 1}\t${title ?? 'Untitled conversation'}`));
      break;
    case 'import-chatgpt': {
      const list = parseExport(inputText);
      if (!conversation && list.length > 1) throw new Error('The export contains multiple conversations. Use list-chatgpt, then pass --conversation N.');
      const selected = list[(conversation ?? 1) - 1];
      if (!selected) throw new Error(`Choose a conversation from 1 to ${list.length}.`);
      await save(output ?? `${stem}.adf`, serializeADF(fromConversation(selected)));
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Run npm run adf -- --help.`);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`ADF: ${error.message}`);
  process.exitCode = 1;
}
