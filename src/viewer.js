import example from '../examples/pca.adf' with { type: 'json' };
import { filename, MAX_BYTES, parseADF, serializeADF } from './format.js';
import { fromConversation, fromMarkdown, parseExport } from './import.js';
import { portableHTML } from './html.js';
import { documentHTML } from './render.js';
import { updateProjection } from './visuals.js';

function save(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function enhance(root) {
  for (const card of root.querySelectorAll('.quiz')) {
    const buttons = Array.from(card.querySelectorAll('[data-choice]'));
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const correct = button.dataset.choice === card.dataset.answer;
        for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
        card.querySelector('.quiz-result').textContent = correct ? 'Correct.' : 'Try again, or open the answer below.';
        if (correct) card.querySelector('.quiz-explanation').open = true;
      });
    }
  }
  for (const slider of root.querySelectorAll('[data-angle]')) {
    const card = slider.closest('[data-projection]');
    const points = JSON.parse(card.dataset.projection);
    slider.addEventListener('input', () => updateProjection(card, points, Number(slider.value)));
  }
  for (const slider of root.querySelectorAll('[data-plot]')) {
    const card = slider.closest('figure');
    const dots = Array.from(card.querySelectorAll('[data-point]'));
    function inspect() {
      const index = Number(slider.value);
      const dot = dots[index];
      card.querySelector('.is-active')?.classList.remove('is-active');
      dot.classList.add('is-active');
      card.querySelector('.visual-output').textContent = `Point ${index + 1} of ${dots.length} · ${dot.querySelector('title').textContent}`;
    }
    slider.addEventListener('input', inspect);
    for (const dot of dots) dot.addEventListener('click', () => {
      slider.value = dot.dataset.point;
      inspect();
    });
    inspect();
  }
  for (const code of root.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    pre.tabIndex = 0;
    if (!navigator.clipboard?.writeText) continue;
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = code.dataset.copyLabel || 'Copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Select code to copy';
      }
    });
    pre.replaceWith(wrap);
    wrap.append(button, pre);
  }
}

function startViewer() {
  const $ = id => document.getElementById(id);
  const fileInput = $('file-input');
  const reader = $('reader');
  const status = $('status');
  const picker = $('conversation-picker');
  const assets = { css: $('adf-style').textContent, runtime: $('adf-runtime').textContent };
  let current;
  let conversations = [];
  let loadSequence = 0;
  enhance($('agent-help'));

  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function show(next, message) {
    const html = documentHTML(next);
    reader.innerHTML = html;
    enhance(reader);
    current = next;
    $('document-actions').hidden = false;
    report(message);
  }

  function resetPicker() {
    conversations = [];
    picker.hidden = true;
    $('conversation').replaceChildren();
  }

  function chooseConversation() {
    try {
      const index = Number($('conversation').value);
      show(fromConversation(conversations[index]), `Opened conversation ${index + 1} of ${conversations.length}.`);
    } catch (error) {
      report(error.message, true);
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const sequence = ++loadSequence;
    resetPicker();
    fileInput.value = '';
    try {
      if (file.size > MAX_BYTES) throw new Error('This file exceeds 32 MiB. Open a smaller export or use direct page capture.');
      const text = await file.text();
      if (sequence !== loadSequence) return;
      if (/\.(md|markdown|txt)$/i.test(file.name)) {
        show(fromMarkdown(text, file.name.replace(/\.[^.]+$/, '')), 'Markdown imported.');
      } else if (/\.adf$/i.test(file.name) || /^\s*\{\s*"adf"\s*:/.test(text)) {
        show(parseADF(text), 'ADF document opened.');
      } else {
        const json = JSON.parse(text.replace(/^\uFEFF/, ''));
        if (json && Object.hasOwn(json, 'adf')) {
          show(parseADF(text), 'ADF document opened.');
          return;
        }
        conversations = parseExport(text);
        for (const [index, item] of conversations.entries()) {
          const option = new Option(typeof item.title === 'string' && item.title.trim() ? item.title : `Conversation ${index + 1}`, index);
          $('conversation').add(option);
        }
        picker.hidden = conversations.length < 2;
        chooseConversation();
      }
    } catch (error) {
      if (sequence === loadSequence) report(error.message, true);
    }
  });

  $('conversation').addEventListener('change', chooseConversation);
  $('open-sample').addEventListener('click', () => {
    loadSequence++;
    resetPicker();
    show(example, 'Example opened.');
  });

  $('paste-form').addEventListener('submit', event => {
    event.preventDefault();
    loadSequence++;
    resetPicker();
    try {
      const text = $('paste-input').value;
      if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Pasted text exceeds 32 MiB.');
      if (/^\s*\{\s*"adf"\s*:/.test(text)) show(parseADF(text), 'ADF document opened.');
      else show(fromMarkdown(text, $('paste-title').value || 'Pasted response'), 'Markdown imported.');
      $('paste-panel').open = false;
    } catch (error) {
      report(error.message, true);
    }
  });

  $('save-adf').addEventListener('click', () => {
    try {
      save(`${filename(current.title)}.adf`, serializeADF(current), 'application/json');
    } catch (error) {
      report(error.message, true);
    }
  });
  $('save-html').addEventListener('click', () => {
    try {
      save(`${filename(current.title)}.html`, portableHTML(current, assets), 'text/html;charset=utf-8');
    } catch (error) {
      report(error.message, true);
    }
  });
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-print]')) window.print();
});
if (document.body.dataset.mode === 'portable') enhance(document.getElementById('reader'));
else startViewer();
