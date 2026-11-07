import { escapeHTML } from './markdown.js';
import { documentHTML } from './render.js';

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

export function pageHTML({ css, runtime, content, title, mode }) {
  if (/<\/script/i.test(runtime) || /<\/style/i.test(css)) throw new Error('Unexpected closing tag in build assets.');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="color-scheme" content="light dark">
<title>${escapeHTML(title)}</title><style id="adf-style">${css}</style></head>
<body data-mode="${mode}">
<header class="masthead"><div class="masthead-inner"><span class="wordmark"><span class="brand-icon" aria-hidden="true">◇</span> ADF</span>
  <span class="masthead-label">Agentic Document Format</span>
${mode === 'portable' ? '<button class="print-button" type="button" data-print>Print</button>' : ''}
</div></header>
${content}
<footer class="site-footer">ADF 1.0 <span aria-hidden="true">·</span> Portable documents for humans and agents</footer>
<script id="adf-runtime">${runtime}</script>
</body></html>
`;
}

export function portableHTML(document, assets) {
  return pageHTML({
    ...assets, title: document.title, mode: 'portable',
    content: `<main id="reader" class="reader">${documentHTML(document)}</main>`,
  });
}

export function readAssets(html) {
  const css = html.match(/<style id="adf-style">([\s\S]*?)<\/style>/)?.[1];
  const runtime = html.match(/<script id="adf-runtime">([\s\S]*?)<\/script>/)?.[1];
  if (!css || !runtime) throw new Error('Invalid viewer build. Run npm run build.');
  return { css, runtime };
}
