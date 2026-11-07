import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseADF, serializeADF, validate } from '../src/format.js';
import { fromConversation, fromMarkdown, parseExport } from '../src/import.js';
import { markdownHTML } from '../src/markdown.js';
import { documentHTML } from '../src/render.js';
import { projectionState } from '../src/visuals.js';

const doc = (...blocks) => ({ adf: '1.0', title: 'Test', blocks });
const markdown = { type: 'markdown', text: 'Hello' };
const turn = (role, parts, extra = {}) => ({ author: { role }, content: { content_type: 'text', parts }, ...extra });

test('the reference document round-trips through ADF JSON', async () => {
  const example = parseADF(await readFile(new URL('../examples/pca.adf', import.meta.url), 'utf8'));
  assert.deepEqual(parseADF(serializeADF(example)), example);
  assert.match(documentHTML(example), /<math /);
});

test('validation reports paths and rejects unsupported or inconsistent data', () => {
  assert.throws(() => validate({ ...doc(markdown), adf: '2.0' }), /\$\.adf/);
  assert.throws(() => validate(doc({ type: 'script', text: 'alert(1)' })), /unknown block type/);
  assert.throws(() => validate(doc({ type: 'quiz', prompt: 'Q', choices: ['A', 'B'], answer: 3 })), /answer.*existing choice/);
  assert.throws(() => validate(doc({ type: 'diagram', title: 'Flow', nodes: [{ id: 'a', label: 'A' }], edges: [{ from: 'a', to: 'b' }] })), /edges\[0\]/);
  assert.throws(() => validate(doc({ type: 'plot', title: 'Plot', points: [[Infinity, 0]] })), /finite number/);
  assert.throws(() => parseADF('{"adf":"1.0","title":"X","__proto__":{},"blocks":[{"type":"math","tex":"x"}]}'), /unexpected field "__proto__"/);
  let deeplyNested = markdown;
  for (let i = 0; i < 13; i++) deeplyNested = { type: 'details', title: 'Nested', blocks: [deeplyNested] };
  assert.throws(() => validate(doc(deeplyNested)), /nested too deeply/);
});

test('ChatGPT import follows the active branch and omits hidden and tool turns', () => {
  const mapping = {
    root: { parent: null },
    user: { parent: 'root', message: turn('user', ['Question']) },
    stale: { parent: 'user', message: turn('assistant', ['Old reply']) },
    hidden: { parent: 'user', message: turn('assistant', ['Hidden'], { metadata: { is_visually_hidden_from_conversation: true } }) },
    tool: { parent: 'hidden', message: turn('assistant', ['Tool call'], { recipient: 'tool.example' }) },
    active: { parent: 'tool', message: turn('assistant', ['Chosen reply', { content_type: 'image_asset_pointer' }, '\uE200genui\uE202thing\uE201']) },
  };
  const [conversation] = parseExport(JSON.stringify([{ title: 'Test chat', current_node: 'active', mapping }]));
  const result = fromConversation(conversation);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[1].blocks[0].text, 'Chosen reply');
  assert.equal(result.blocks[1].blocks[1].type, 'fallback');
  assert.match(result.blocks[1].blocks[2].text, /Interactive content unavailable/);
  assert.equal(result.warnings.length, 2);
  assert.throws(() => fromConversation({ ...conversation, mapping: { active: { parent: 'active' } } }), /cycle/);
});

test('Markdown renders equations and tables, escapes HTML, and blocks active URLs', () => {
  const html = markdownHTML(String.raw`Inline $x^2$ and \(y\).

\[\frac{1}{n}\]

| A | B |
|---|---|
| 1 | 2 |

<img src=x onerror="alert(1)">

[bad](javascript:alert) ![remote](https://example.org/beacon.gif)`);
  assert.equal((html.match(/<math /g) ?? []).length, 3);
  assert.match(html, /class="table-scroll"[^>]*><table>/);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(html, /<img\b|href="javascript:/);
  assert.match(html, /href="https:\/\/example.org\/beacon.gif"/);
});

test('Mermaid import converts basic edges and keeps richer source intact', () => {
  const basic = fromMarkdown('Before\n\n```mermaid\nflowchart LR\n A[Data] -->|train| B(Model) --> C\n```\n\nAfter');
  assert.deepEqual(basic.blocks.map(block => block.type), ['markdown', 'diagram', 'details', 'markdown']);
  assert.deepEqual(basic.blocks[1].edges, [{ from: 'A', to: 'B', label: 'train' }, { from: 'B', to: 'C' }]);
  const complex = fromMarkdown('```mermaid\nsequenceDiagram\n A->>B: Hello\n```');
  assert.equal(complex.blocks[0].type, 'markdown');
  assert.match(complex.warnings[0], /outside/);
});

test('projection computes population variance after centering', () => {
  const points = [[1, 4], [3, 4], [5, 4]];
  assert.equal(projectionState(points, 0).variance, 8 / 3);
  assert.ok(projectionState(points, 90).variance < 1e-20);
});
