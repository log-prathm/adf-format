import { Lexer } from 'marked';
import { mermaidDiagram } from './mermaid.js';
import { MAX_BYTES, validate } from './format.js';

const widgetPattern = /\uE200(?:genui|image_group|video|finance|forecast|sports|navlist|products)[\s\S]*?\uE201/g;
const citationPattern = /\uE200(?:cite|filecite)[\s\S]*?\uE201/g;

export function markdownBlocks(text, warnings = new Set()) {
  text = text.replace(widgetPattern, () => {
    warnings.add('Some provider widgets were replaced with a visible placeholder.');
    return '[Interactive content unavailable in this export]';
  }).replace(citationPattern, () => {
    warnings.add('Some citations use provider IDs without portable links.');
    return '[Source link unavailable]';
  });
  if (!text.trim()) return [];
  if (!/^ {0,3}(`{3,}|~{3,})[ \t]*mermaid\b/im.test(text)) return [{ type: 'markdown', text }];
  const blocks = [];
  let prose = '';
  const flush = () => {
    if (prose.trim()) blocks.push({ type: 'markdown', text: prose });
    prose = '';
  };
  for (const token of Lexer.lex(text)) {
    if (token.type !== 'code' || token.lang?.trim().split(/\s/)[0].toLowerCase() !== 'mermaid') {
      prose += token.raw;
      continue;
    }
    const diagram = mermaidDiagram(token.text);
    if (!diagram) {
      warnings.add('A Mermaid diagram uses syntax outside ADF’s flowchart subset. Its source was kept.');
      prose += token.raw;
      continue;
    }
    flush();
    blocks.push(diagram, { type: 'details', title: 'Original Mermaid source', blocks: [{ type: 'markdown', text: token.raw }] });
  }
  flush();
  return blocks;
}

export function fromMarkdown(text, title = 'Imported notes') {
  const warnings = new Set();
  const blocks = markdownBlocks(text, warnings);
  return makeDocument(title, 'markdown', blocks, warnings);
}

export function makeDocument(title, kind, blocks, warnings = new Set(), url) {
  if (!blocks.length) throw new Error('No readable content was found.');
  return validate({
    adf: '1.0',
    title: Array.from(title.trim() || 'Untitled document').slice(0, 180).join(''),
    source: { kind, ...(url && { url }) },
    ...(warnings.size && { warnings: Array.from(warnings).slice(0, 80) }),
    blocks,
  });
}

export function parseExport(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Export exceeds 32 MiB. Import a single conversation or copy its messages.');
  const value = JSON.parse(text.replace(/^\uFEFF/, ''));
  const items = Array.isArray(value) ? value : value?.conversations ?? [value];
  if (!Array.isArray(items)) throw new Error('Expected ChatGPT conversation JSON.');
  const conversations = items.filter(item => item?.mapping && typeof item.mapping === 'object' && !Array.isArray(item.mapping));
  if (!conversations.length) throw new Error('No ChatGPT conversation mapping found. Unzip your export and select a conversation JSON file.');
  return conversations;
}

function activePath({ mapping, current_node: current }) {
  const keys = Object.keys(mapping);
  if (!Object.hasOwn(mapping, current)) {
    const parents = new Set(keys.map(key => mapping[key]?.parent));
    const leaves = keys.filter(key => !parents.has(key));
    current = leaves.reduce((latest, key) =>
      (mapping[key]?.message?.create_time ?? 0) >= (mapping[latest]?.message?.create_time ?? 0) ? key : latest, undefined);
  }
  const path = [];
  const visited = new Set();
  while (current != null && Object.hasOwn(mapping, current) && !visited.has(current)) {
    visited.add(current);
    const node = mapping[current];
    if (!node) break;
    path.push(node);
    current = node.parent;
  }
  if (visited.has(current)) throw new Error('Conversation mapping contains a cycle.');
  return path.reverse();
}

export function fromConversation(conversation) {
  const warnings = new Set();
  const blocks = [];
  for (const { message } of activePath(conversation)) {
    const role = message?.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    if (message.metadata?.is_visually_hidden_from_conversation) continue;
    if (message.recipient && message.recipient !== 'all') continue;
    const content = message.content;
    const parts = content?.parts ?? (typeof content?.text === 'string' ? [content.text] : []);
    const body = [];
    if (message.metadata?.attachments?.length) warnings.add('Some ChatGPT attachments require the original conversation.');
    for (const part of Array.isArray(parts) ? parts : []) {
      if (typeof part === 'string') body.push(...markdownBlocks(part, warnings));
      else if (part?.content_type === 'text' && typeof part.text === 'string') body.push(...markdownBlocks(part.text, warnings));
      else {
        warnings.add('Some export attachments or non-text content were represented as placeholders.');
        body.push({ type: 'fallback', label: 'ChatGPT attachment', text: 'Open the original conversation to view this item.' });
      }
    }
    if (!body.length && content?.content_type && content.content_type !== 'text') {
      warnings.add('Some exported content needs the original ChatGPT interface.');
      body.push({ type: 'fallback', label: 'ChatGPT content', text: 'The export did not include a portable version of this item.' });
    }
    if (body.length) blocks.push({ type: 'message', role, blocks: body });
  }
  return makeDocument(typeof conversation.title === 'string' ? conversation.title : 'ChatGPT conversation', 'chatgpt-export', blocks, warnings);
}
