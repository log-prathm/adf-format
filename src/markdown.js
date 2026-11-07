import { Marked } from 'marked';
import katex from 'katex';

export const escapeHTML = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const rasterData = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i;

export function safeLink(href) {
  if (/^#[A-Za-z0-9_.:%-]+$/.test(href)) return href;
  try {
    const url = new URL(href);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function mathHTML(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, { output: 'mathml', displayMode, trust: false, maxExpand: 150, maxSize: 50 });
  } catch {
    return `<code class="tex-fallback">${escapeHTML(tex)}</code>`;
  }
}

function mathExtension(name, level, delimiters, display) {
  return {
    name,
    level,
    start(src) {
      const offsets = delimiters.map(({ open }) => src.indexOf(open)).filter(index => index >= 0);
      return offsets.length ? Math.min(...offsets) : undefined;
    },
    tokenizer(src) {
      for (const { open, match } of delimiters) {
        if (!src.startsWith(open)) continue;
        const found = match.exec(src);
        if (found?.[1].trim() && found[1].length <= 12_000) {
          return { type: name, raw: found[0], tex: found[1].trim() };
        }
      }
    },
    renderer({ tex }) {
      const math = mathHTML(tex, display);
      return display ? `<div class="display-math">${math}</div>\n` : math;
    },
  };
}

const markdown = new Marked({
  gfm: true,
  extensions: [
    mathExtension('mathBlock', 'block', [
      { open: '$$', match: /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/ },
      { open: '\\[', match: /^\\\[([\s\S]+?)\\\][ \t]*(?:\n|$)/ },
    ], true),
    mathExtension('mathInline', 'inline', [
      { open: '$$', match: /^\$\$((?:\\.|[^$\n])+?)\$\$/ },
      { open: '$', match: /^\$(?![\s$])((?:\\.|[^$\n])+?)(?<!\s)\$(?![\d$])/ },
      { open: '\\(', match: /^\\\((.+?)\\\)/ },
      { open: '\\[', match: /^\\\[(.+?)\\\]/ },
    ], false),
  ],
  renderer: {
    html({ text }) {
      return escapeHTML(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      const url = safeLink(href);
      if (!url) return label;
      const hint = title ? ` title="${escapeHTML(title)}"` : '';
      return `<a href="${escapeHTML(url)}"${hint}${url.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${label}</a>`;
    },
    image({ href, text }) {
      const alt = escapeHTML(text);
      if (rasterData.test(href)) return `<img src="${href}" alt="${alt}" loading="lazy">`;
      const url = safeLink(href);
      return url?.startsWith('http')
        ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open image${alt ? ` · ${alt}` : ''}</a>`
        : `<span class="muted">[Image${alt ? `: ${alt}` : ' unavailable'}]</span>`;
    },
    table(token) {
      return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table">${this.constructor.prototype.table.call(this, token)}</div>`;
    },
  },
});

export function markdownHTML(text) {
  return markdown.parse(text);
}
