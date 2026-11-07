import { validate } from './format.js';
import { escapeHTML, markdownHTML, mathHTML, safeLink } from './markdown.js';
import { diagramHTML, plotHTML, projectionHTML } from './visuals.js';

const blocksHTML = blocks => blocks.map(blockHTML).join('\n');

function blockHTML(block) {
  switch (block.type) {
    case 'markdown':
      return `<div class="markdown">${markdownHTML(block.text)}</div>`;
    case 'math':
      return `<div class="display-math">${mathHTML(block.tex, true)}</div>`;
    case 'message': {
      const label = block.role === 'user' ? 'You' : 'Assistant';
      return `<section class="turn turn-${block.role}" aria-label="${label}"><div class="turn-role">${label}</div>
        <div class="turn-content">${blocksHTML(block.blocks)}</div></section>`;
    }
    case 'details':
      return `<details class="reveal"${block.open ? ' open' : ''}><summary>${escapeHTML(block.title)}</summary><div class="reveal-body">${blocksHTML(block.blocks)}</div></details>`;
    case 'quiz': {
      const options = block.choices.map((choice, i) => `<li><button type="button" data-choice="${i}" aria-pressed="false">${escapeHTML(choice)}</button></li>`).join('');
      const explanation = block.explanation ? markdownHTML(block.explanation) : '';
      return `<section class="visual-card quiz" data-answer="${block.answer}">
        <p class="component-label">Quick check</p><p class="quiz-prompt">${escapeHTML(block.prompt)}</p>
        <ol class="choices">${options}</ol><p class="quiz-result" aria-live="polite"></p>
        <details class="quiz-explanation"><summary>Show answer</summary>
          <p><strong>${escapeHTML(block.choices[block.answer])}</strong></p>${explanation}</details>
      </section>`;
    }
    case 'plot':
      return plotHTML(block);
    case 'projection':
      return projectionHTML(block);
    case 'diagram':
      return diagramHTML(block);
    case 'image':
      return `<figure class="adf-image"><img src="${block.src}" alt="${escapeHTML(block.alt)}" loading="lazy">${block.caption ? `<figcaption>${escapeHTML(block.caption)}</figcaption>` : ''}</figure>`;
    case 'fallback':
      return `<aside class="fallback"><strong>${escapeHTML(block.label)}</strong>${markdownHTML(block.text)}</aside>`;
  }
}

const sourceNames = {
  'chatgpt-ui': 'ChatGPT page capture',
  'chatgpt-export': 'ChatGPT conversation export',
  markdown: 'Markdown import',
  agent: 'Authored in ADF',
};

export function documentHTML(document) {
  validate(document);
  const source = document.source && sourceNames[document.source.kind];
  const url = document.source?.url && safeLink(document.source.url);
  const warnings = document.warnings?.length ? `<details class="import-notes"><summary>Import notes · ${document.warnings.length}</summary>
    <ul>${document.warnings.map(note => `<li>${escapeHTML(note)}</li>`).join('')}</ul></details>` : '';
  return `<article class="document">
    <header class="document-heading">
      <p class="eyebrow">${source ? escapeHTML(source) : 'Agentic Document Format'} · ADF 1.0</p>
      <h1>${escapeHTML(document.title)}</h1>
      ${document.description ? `<p class="document-description">${escapeHTML(document.description)}</p>` : ''}
      ${url ? `<a class="source-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open source conversation ↗</a>` : ''}
      ${warnings}
    </header>
    <div class="document-body">${blocksHTML(document.blocks)}</div>
  </article>`;
}
