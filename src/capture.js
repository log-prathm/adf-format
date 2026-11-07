import TurndownService from 'turndown';
import { strikethrough, tables, taskListItems } from 'turndown-plugin-gfm';
import { filename, serializeADF } from './format.js';
import { makeDocument, markdownBlocks } from './import.js';

const authorSelector = '[data-message-author-role="user"],[data-message-author-role="assistant"]';
const embeddedRaster = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i;
const imageLimit = 160_000;

function rasterImage(img) {
  if (embeddedRaster.test(img.src) && img.src.length <= imageLimit) return img.src;
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const ratio = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = img.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  try {
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', 0.78);
    return embeddedRaster.test(data) && data.length <= imageLimit ? data : null;
  } catch {
    return null;
  }
}

function captureMarkdown(original, pageURL, warnings) {
  const copy = original.cloneNode(true);
  const tokens = new Map();
  const nonce = globalThis.crypto.randomUUID().replaceAll('-', '');
  const protect = (node, text) => {
    const token = `ADFCAPTURE${nonce}${tokens.size}END`;
    tokens.set(token, text);
    node.replaceWith(copy.ownerDocument.createTextNode(token));
  };

  copy.querySelectorAll('button, script, style, [hidden], [aria-hidden="true"]:not(.katex-html), [data-testid="copy-turn-action"], [data-testid="copy-code-button"], .sr-only:not(.katex-mathml)').forEach(node => {
    if (!node.closest('.katex') && !node.closest('pre > code')) node.remove();
  });
  const imageNodes = Array.from(copy.querySelectorAll('img'));
  const liveImages = Array.from(original.querySelectorAll('img')).filter(img =>
    !img.closest('button, script, style, [hidden], [aria-hidden="true"]:not(.katex-html), .sr-only:not(.katex-mathml)'));
  imageNodes.forEach((image, i) => {
    const data = liveImages[i] && rasterImage(liveImages[i]);
    if (data) image.setAttribute('src', data);
    else {
      warnings.add('Some images could not be embedded. Use the source conversation for the originals.');
      protect(image, `[Image unavailable${image.alt ? ` · ${image.alt.replace(/[\[\]]/g, '')}` : ''}]`);
    }
  });

  for (const node of copy.querySelectorAll('.katex-display, .katex:not(.katex-display .katex), math')) {
    if (!copy.contains(node)) continue;
    const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (!tex) {
      if (node.matches('math')) {
        const fallback = node.getAttribute('aria-label') || node.querySelector('semantics')?.firstElementChild?.textContent || node.textContent;
        warnings.add('Some equations had no TeX annotation and were captured as text.');
        protect(node, fallback.trim() || '[Equation unavailable]');
      }
      continue;
    }
    const isDisplay = node.matches('.katex-display, math[display="block"]');
    protect(node, isDisplay ? `\n\n$$\n${tex}\n$$\n\n` : `\\(${tex}\\)`);
  }

  for (const node of copy.querySelectorAll('iframe, canvas, video, audio, [data-testid*="genui"], [data-testid*="widget"], svg[aria-roledescription]')) {
    if (!copy.contains(node)) continue;
    const title = (node.getAttribute('aria-label') || node.getAttribute('title') || node.querySelector('title')?.textContent || '').trim().slice(0, 140);
    warnings.add('Some embedded widgets were replaced with a label. Their original controls are available in ChatGPT.');
    protect(node, `\n\n> Interactive content unavailable${title ? ` · ${title.replace(/[\n\r]/g, ' ')}` : ''}\n\n`);
  }
  copy.querySelectorAll('svg').forEach(node => node.remove());

  for (const link of copy.querySelectorAll('a[href]')) {
    try {
      const url = new URL(link.getAttribute('href'), pageURL);
      if (['http:', 'https:'].includes(url.protocol)) link.setAttribute('href', url.href);
      else link.replaceWith(...link.childNodes);
    } catch {
      link.replaceWith(...link.childNodes);
    }
  }

  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  converter.use([tables, strikethrough, taskListItems]);
  converter.addRule('captureImage', {
    filter: 'img',
    replacement(_, node) {
      const alt = (node.getAttribute('alt') ?? '').replace(/[\[\]\r\n]/g, ' ');
      return `![${alt}](${node.getAttribute('src')})`;
    },
  });
  // Turndown keeps headerless tables as HTML. Promote their first row so they stay portable.
  for (const table of copy.querySelectorAll('table')) {
    if (table.rows[0] && !table.rows[0].querySelector('th')) {
      for (const cell of Array.from(table.rows[0].cells)) {
        const header = copy.ownerDocument.createElement('th');
        header.append(...cell.childNodes);
        cell.replaceWith(header);
      }
    }
  }
  const markdown = converter.turndown(copy).trim();
  return markdown.replace(new RegExp(`ADFCAPTURE${nonce}\\d+END`, 'g'), token => tokens.get(token));
}

export function captureDocument(page = document, url = location.href) {
  const source = new URL(url);
  if (!['chatgpt.com', 'chat.openai.com'].includes(source.hostname) || source.protocol !== 'https:') {
    throw new Error('Open a ChatGPT conversation first.');
  }

  const warnings = new Set();
  const ids = new Set();
  const blocks = [];
  for (const node of page.querySelectorAll(authorSelector)) {
    if (node.parentElement?.closest(authorSelector) || node.closest('[hidden], [aria-hidden="true"], [inert]')) continue;
    const id = node.dataset.messageId;
    if (id && ids.has(id)) continue;
    if (id) ids.add(id);
    const role = node.dataset.messageAuthorRole;
    const body = markdownBlocks(captureMarkdown(node, source.href, warnings), warnings);
    if (body.length) blocks.push({ type: 'message', role, blocks: body });
  }
  const title = page.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i, '');
  const sourceURL = /\/(?:c|share)\/[A-Za-z0-9-]+\/?$/.test(source.pathname) ? source.origin + source.pathname : undefined;
  return makeDocument(title, 'chatgpt-ui', blocks, warnings, sourceURL);
}

export function captureAndDownload() {
  try {
    const captured = captureDocument();
    const url = URL.createObjectURL(new Blob([serializeADF(captured)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filename(captured.title)}.adf`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return { turns: captured.blocks.length, warnings: captured.warnings?.length ?? 0 };
  } catch (error) {
    return { error: error.message };
  }
}
