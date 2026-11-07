import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, devices } from 'playwright';
import { parseADF } from '../src/format.js';

const viewer = new URL('../docs/index.html', import.meta.url).href;
const capture = fileURLToPath(new URL('../extension/capture.js', import.meta.url));
let browser;
let temporary;

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'adf-test-'));
  browser = await chromium.launch({
    ...(process.env.ADF_CHROMIUM_PATH && { executablePath: process.env.ADF_CHROMIUM_PATH }),
  });
});

after(async () => {
  await browser?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test('desktop viewer renders sample interactions and downloads HTML that runs offline', async () => {
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(viewer);
    await page.getByRole('button', { name: 'Try the PCA example' }).click();
    assert.equal(await page.locator('.document h1').textContent(), 'PCA in two dimensions');
    assert.ok(await page.locator('math').count() >= 2);
    const projected = page.locator('.visual-output');
    const start = await projected.textContent();
    await page.getByRole('slider', { name: 'Rotate projection axis' }).fill('45');
    assert.notEqual(await projected.textContent(), start);
    await page.getByRole('button', { name: 'The direction with the smallest projected variance' }).click();
    assert.match(await page.locator('.quiz-result').textContent(), /Try again/);
    await page.getByRole('button', { name: 'The direction with the largest projected variance' }).click();
    assert.equal(await page.locator('.quiz-result').textContent(), 'Correct.');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download offline HTML' }).click(),
    ]);
    const output = join(temporary, download.suggestedFilename());
    await download.saveAs(output);
    await page.goto(pathToFileURL(output).href);
    assert.equal(await page.locator('.document h1').textContent(), 'PCA in two dimensions');
    await page.getByRole('slider', { name: 'Rotate projection axis' }).fill('75');
    assert.match(await page.locator('.visual-output').textContent(), /75°/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
});

test('mobile viewport opens a chat export and keeps wide tables inside the reader', async () => {
  const context = await browser.newContext({ ...devices['Pixel 7'], offline: true });
  try {
    const page = await context.newPage();
    await page.goto(viewer);
    const chat = {
      title: 'Mobile chat', current_node: 'b', mapping: {
        a: { parent: null, message: { author: { role: 'user' }, content: { parts: ['Show me data.'] } } },
        b: { parent: 'a', message: { author: { role: 'assistant' }, content: { parts: [
          '| Alpha | Beta | Gamma | Delta | Epsilon | Zeta |\n|---|---|---|---|---|---|\n| 10 | 11 | 12 | 13 | 14 | 15 |',
        ] } } },
      },
    };
    await page.locator('#file-input').setInputFiles({ name: 'conversations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([chat, { ...chat, title: 'Another chat' }])) });
    await page.getByRole('heading', { name: 'Mobile chat' }).waitFor();
    await page.getByLabel('Choose a ChatGPT conversation').selectOption('1');
    await page.getByRole('heading', { name: 'Another chat' }).waitFor();
    assert.equal(await page.locator('.turn').count(), 2);
    assert.equal(await page.locator('table').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await context.close();
  }
});

test('page capture converts ChatGPT-shaped rendered UI into ADF and records missing widgets', async () => {
  const path = join(temporary, 'fixture.html');
  await writeFile(path, `<!doctype html><title>Captured lesson - ChatGPT</title>
  <div data-message-author-role="user" data-message-id="one"><p>Explain the equation.</p></div>
  <div data-message-author-role="assistant" data-message-id="two">
    <h2>Answer</h2><p>A <a href="https://example.org">reference</a> and <span class="katex"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math><span aria-hidden="true">duplicated math</span></span>.</p>
    <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>
    <pre><code class="language-python">print(1)</code></pre>
    <div data-testid="genui-widget" aria-label="Interactive chart"><canvas></canvas></div>
    <button>Copy response</button>
  </div><div hidden data-message-author-role="assistant">Do not capture this</div>`);
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(path).href);
    await page.addScriptTag({ path: capture });
    const doc = await page.evaluate(() => window.ADFPageCapture.captureDocument(document, 'https://chatgpt.com/c/abc-123?unused=secret'));
    assert.equal(doc.title, 'Captured lesson');
    assert.equal(doc.source.url, 'https://chatgpt.com/c/abc-123');
    assert.equal(doc.blocks.length, 2);
    const text = doc.blocks[1].blocks[0].text;
    assert.match(text, /## Answer/);
    assert.match(text, /\\\(x\^2\\\)/);
    assert.match(text, /\| A \| B \|/);
    assert.match(text, /print\(1\)/);
    assert.match(text, /Interactive content unavailable · Interactive chart/);
    assert.doesNotMatch(text, /Copy response|duplicated math/);
    assert.equal(doc.warnings.length, 1);
  } finally {
    await page.close();
  }
});

test('downloaded ADF round-trips and standalone HTML has readable static content', async () => {
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    await page.goto(viewer);
    await page.getByRole('button', { name: 'Try the PCA example' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download .adf' }).click(),
    ]);
    assert.equal(parseADF(await readFile(await download.path(), 'utf8')).title, 'PCA in two dimensions');
    const [html] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download offline HTML' }).click(),
    ]);
    assert.match(await readFile(await html.path(), 'utf8'), /<h1>PCA in two dimensions<\/h1>/);
  } finally {
    await context.close();
  }
});
