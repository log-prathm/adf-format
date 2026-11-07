import { enhance, startViewer } from './viewer.js';

const $ = id => document.getElementById(id);
const normalize = text => text.replace(/\s+/g, ' ').trim();
const headingSelector = 'h1,h2,h3,h4,h5,h6';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function sheet(number) {
  const node = element('section', 'paper-sheet');
  const body = element('div', 'paper-sheet-body');
  const footer = element('footer', 'paper-page-footer', String(number));
  node.setAttribute('aria-label', `Page ${number}`);
  node.append(body, footer);
  return { node, body };
}

function readingUnits(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const units = [];

  function add(node, markdown = false) {
    const wrapper = element('div', 'paper-unit');
    const content = markdown ? element('div', 'markdown') : wrapper;
    const heading = node.matches(headingSelector) ? node : node.matches('.document-heading') ? node.querySelector('h1') : null;
    const text = normalize(node.textContent);
    content.append(node);
    if (markdown) wrapper.append(content);
    units.push({ wrapper, heading, text, folded: text.toLocaleLowerCase() });
  }

  function visit(node) {
    if (node.matches('.markdown')) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) add(child, true);
        else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          add(element('p', null, child.textContent), true);
        }
      }
    } else if (node.matches('.turn-assistant')) {
      add(node.querySelector('.turn-role'));
      Array.from(node.querySelector('.turn-content').children).forEach(visit);
    } else {
      add(node);
    }
  }

  add(template.content.querySelector('.document-heading'));
  Array.from(template.content.querySelector('.document-body').children).forEach(visit);
  return units;
}

function navigationButton(label, number, depth = 0) {
  const button = element('button', 'paper-nav-row');
  button.type = 'button';
  const name = element('span', 'paper-nav-label', label);
  name.style.setProperty('--depth', depth);
  button.append(name, element('span', 'paper-nav-number', String(number)));
  return button;
}

function paperReader() {
  const stage = $('reader');
  const layout = $('paper-layout');
  const sidebar = $('paper-sidebar');
  const pageField = $('paper-number');
  const query = $('paper-query');
  const narrow = matchMedia('(max-width: 760px)');
  let units = [];
  let pages = [];
  let pageIndex = 0;
  let layoutWidth = 0;
  let activeTab = 'outline';
  let matched;
  let printing = false;
  let frame = 0;
  let layoutFrame = 0;
  let lastNavigation;

  function mount(page) {
    if (page.mounted) return;
    const content = document.createDocumentFragment();
    page.units.forEach(unit => content.append(unit.wrapper));
    page.body.append(content);
    page.mounted = true;
  }

  function unmount(page) {
    if (!page.mounted || page.node.contains(document.activeElement)) return;
    page.body.replaceChildren();
    page.mounted = false;
  }

  const observer = new IntersectionObserver(entries => {
    if (printing) return;
    for (const entry of entries) {
      const page = pages[Number(entry.target.dataset.page)];
      if (page?.node !== entry.target) continue;
      if (entry.isIntersecting) mount(page);
      else if (page.index !== pageIndex) unmount(page);
    }
  }, { rootMargin: '800px 0px' });

  function setPage(index) {
    if (!pages.length) return;
    pageIndex = Math.max(0, Math.min(index, pages.length - 1));
    if (document.activeElement !== pageField) pageField.value = String(pageIndex + 1);
    $('paper-prev').disabled = pageIndex === 0;
    $('paper-next').disabled = pageIndex === pages.length - 1;
    lastNavigation?.removeAttribute('aria-current');
    lastNavigation = pages[pageIndex].thumbnail;
    lastNavigation?.setAttribute('aria-current', 'page');
    mount(pages[pageIndex]);
  }

  function jump(index, unit) {
    setPage(index);
    pageField.value = String(pageIndex + 1);
    if (unit) unit.wrapper.scrollIntoView({ block: 'start' });
    else pages[pageIndex].node.scrollIntoView({ block: 'start' });
  }

  function showSidebar(open) {
    sidebar.hidden = !open;
    layout.dataset.sidebar = open ? 'open' : 'closed';
    $('paper-sidebar-toggle').setAttribute('aria-expanded', String(open));
  }

  function refreshNavigation() {
    const outline = $('paper-outline').querySelector('ol');
    const thumbs = $('paper-thumbs').querySelector('ol');
    outline.replaceChildren();
    thumbs.replaceChildren();
    for (const page of pages) {
      const button = element('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Go to page ${page.index + 1}`);
      const preview = element('span', 'paper-thumb-sheet');
      preview.setAttribute('aria-hidden', 'true');
      for (const unit of page.units.slice(0, 12)) {
        const line = element('i');
        line.style.setProperty('--line-width', `${Math.min(100, 35 + unit.text.length / 3)}%`);
        preview.append(line);
      }
      button.append(preview, element('span', 'paper-thumb-page', String(page.index + 1)));
      button.addEventListener('click', () => jump(page.index));
      const item = element('li');
      item.append(button);
      thumbs.append(item);
      page.thumbnail = button;

      for (const unit of page.units) {
        if (!unit.heading) continue;
        const heading = normalize(unit.heading.textContent);
        if (!heading) continue;
        const link = navigationButton(heading, page.index + 1, Number(unit.heading.tagName[1]) - 1);
        link.addEventListener('click', () => jump(page.index, unit));
        const entry = element('li');
        entry.append(link);
        outline.append(entry);
      }
    }
  }

  function search() {
    const needle = normalize(query.value).toLocaleLowerCase();
    const results = $('paper-results');
    const list = results.querySelector('ol');
    list.replaceChildren();
    results.hidden = !needle;
    $('paper-outline').hidden = !!needle || activeTab !== 'outline';
    $('paper-thumbs').hidden = !!needle || activeTab !== 'thumbs';
    if (!needle) return;

    let count = 0;
    for (const unit of units) {
      const offset = unit.folded.indexOf(needle);
      if (offset < 0) continue;
      count++;
      if (count > 100) continue;
      const start = Math.max(0, offset - 28);
      const end = Math.min(unit.text.length, offset + needle.length + 60);
      const snippet = `${start ? '…' : ''}${unit.text.slice(start, end)}${end < unit.text.length ? '…' : ''}`;
      const button = navigationButton(snippet, unit.page + 1);
      button.addEventListener('click', () => {
        matched?.classList.remove('is-match');
        matched = unit.wrapper;
        matched.classList.add('is-match');
        for (const detail of matched.querySelectorAll('details')) {
          if (normalize(detail.textContent).toLocaleLowerCase().includes(needle)) detail.open = true;
        }
        if (narrow.matches) showSidebar(false);
        jump(unit.page, unit);
      });
      const entry = element('li');
      entry.append(button);
      list.append(entry);
    }
    $('paper-match-count').textContent = count > 100 ? `${count} matching passages · first 100 shown`
      : `${count} matching passage${count === 1 ? '' : 's'}`;
  }

  function paginate(keepPosition = false) {
    const anchor = keepPosition ? pages[pageIndex]?.units[0] : null;
    observer.disconnect();
    stage.replaceChildren();
    const probe = element('div', 'paper-measure');
    probe.setAttribute('aria-hidden', 'true');
    probe.inert = true;
    const measure = sheet(1);
    probe.append(measure.node);

    // Measure the expanded state once. Controls can then change inside a page
    // without assigning any content to a different page.
    const collapsed = [];
    for (const unit of units) {
      unit.wrapper.classList.remove('is-oversize');
      unit.wrapper.removeAttribute('tabindex');
      for (const detail of unit.wrapper.querySelectorAll('details:not([open])')) {
        collapsed.push(detail);
        detail.open = true;
      }
      measure.body.append(unit.wrapper);
    }
    stage.append(probe);
    layoutWidth = stage.clientWidth;
    const capacity = measure.body.clientHeight;
    const gap = Number.parseFloat(getComputedStyle(measure.body).rowGap);
    const heights = units.map(unit => unit.wrapper.getBoundingClientRect().height);
    probe.remove();
    collapsed.forEach(detail => { detail.open = false; });

    const groups = [[]];
    let used = 0;
    stage.style.setProperty('--paper-body-height', `${capacity}px`);
    units.forEach((unit, i) => {
      const height = Math.min(capacity, heights[i]);
      const attached = !!unit.heading?.closest('.markdown') || !!unit.wrapper.querySelector('.turn-role');
      const withNext = attached && i + 1 < units.length ? height + gap + heights[i + 1] : height;
      const remaining = capacity - used - (used ? gap : 0);
      if (used && (height > remaining || (withNext <= capacity && withNext > remaining))) {
        groups.push([]);
        used = 0;
      }
      if (heights[i] > capacity) {
        unit.wrapper.classList.add('is-oversize');
        unit.wrapper.tabIndex = 0;
      }
      unit.page = groups.length - 1;
      groups.at(-1).push(unit);
      used += (used ? gap : 0) + height;
    });

    const fragment = document.createDocumentFragment();
    pages = groups.map((group, index) => {
      const page = { ...sheet(index + 1), units: group, index };
      page.node.dataset.page = String(index);
      fragment.append(page.node);
      return page;
    });
    stage.append(fragment);
    pages.forEach(page => observer.observe(page.node));
    $('paper-total').textContent = `/ ${pages.length}`;
    refreshNavigation();
    search();
    setPage(anchor?.page ?? 0);
    pageField.value = String(pageIndex + 1);
    if (anchor) jump(pageIndex);
  }

  function open(html, title) {
    units = readingUnits(html);
    for (const unit of units) enhance(unit.wrapper);
    matched = null;
    query.value = '';
    $('paper-title').textContent = title;
    $('paper-files').open = false;
    layout.hidden = false;
    showSidebar(!narrow.matches);
    for (const id of ['paper-sidebar-toggle', 'paper-find', 'paper-number']) $(id).disabled = false;
    paginate();
    if (window.scrollY > layout.offsetTop) jump(0);
  }

  $('paper-file').addEventListener('click', () => {
    $('paper-files').open = true;
    $('file-input').click();
  });
  $('paper-sidebar-toggle').addEventListener('click', () => showSidebar(sidebar.hidden));
  $('paper-sidebar-close').addEventListener('click', () => {
    showSidebar(false);
    $('paper-sidebar-toggle').focus();
  });
  $('paper-prev').addEventListener('click', () => jump(pageIndex - 1));
  $('paper-next').addEventListener('click', () => jump(pageIndex + 1));
  $('paper-jump').addEventListener('submit', event => {
    event.preventDefault();
    const number = Number(pageField.value);
    if (Number.isInteger(number) && number >= 1 && number <= pages.length) jump(number - 1);
    else pageField.value = String(pageIndex + 1);
  });
  pageField.addEventListener('blur', () => { pageField.value = String(pageIndex + 1); });

  function focusSearch() {
    showSidebar(true);
    query.focus();
    query.select();
  }
  $('paper-find').addEventListener('click', focusSearch);
  $('paper-search').addEventListener('submit', event => {
    event.preventDefault();
    search();
  });
  query.addEventListener('input', () => {
    if (!query.value) search();
  });
  for (const name of ['outline', 'thumbs']) {
    $(`paper-${name}-tab`).addEventListener('click', () => {
      activeTab = name;
      query.value = '';
      $('paper-outline-tab').setAttribute('aria-pressed', String(name === 'outline'));
      $('paper-thumbs-tab').setAttribute('aria-pressed', String(name === 'thumbs'));
      search();
    });
  }
  document.addEventListener('keydown', event => {
    if (pages.length && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusSearch();
    } else if (narrow.matches && !sidebar.hidden && event.key === 'Escape') {
      showSidebar(false);
      $('paper-sidebar-toggle').focus();
    }
  });

  window.addEventListener('scroll', () => {
    if (!pages.length || frame || printing) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (printing) return;
      if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
        if (pageIndex !== pages.length - 1) setPage(pages.length - 1);
        return;
      }
      const readingLine = Math.min(135, innerHeight / 3);
      let low = 0;
      let high = pages.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (pages[middle].node.getBoundingClientRect().top <= readingLine) low = middle;
        else high = middle - 1;
      }
      if (low !== pageIndex) setPage(low);
    });
  }, { passive: true });

  new ResizeObserver(() => {
    if (!units.length || printing || layoutFrame || stage.clientWidth === layoutWidth) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (!printing && stage.clientWidth !== layoutWidth) paginate(true);
    });
  }).observe(stage);

  window.addEventListener('beforeprint', () => {
    printing = true;
    pages.forEach(mount);
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    observer.disconnect();
    pages.forEach(page => observer.observe(page.node));
  });

  return open;
}

if (document.body.dataset.mode === 'paged') startViewer(paperReader());
