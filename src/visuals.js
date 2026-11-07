import { escapeHTML } from './markdown.js';

const COLORS = ['#006f58', '#345bc4', '#8b40a0', '#b25a15'];
const frame = { left: 51, right: 493, top: 24, bottom: 252 };
const rounded = value => Number(value.toPrecision(5));
const svgFrame = (label, content, viewBox = '0 0 520 292', className = '') =>
  `<svg class="visual-svg ${className}" viewBox="${viewBox}" role="img" aria-label="${escapeHTML(label)}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;

function scale(points, key, from, to) {
  const values = points.map(point => point[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.abs(max) || 1) * 0.12;
  const low = min - padding;
  const high = max + padding;
  return { low, high, at: value => from + (value - low) / (high - low) * (to - from) };
}

function grid(x, y, xLabel = '', yLabel = '') {
  const { left, right, top, bottom } = frame;
  return `<path class="chart-frame" d="M${left},${top} H${right} V${bottom} H${left} Z"/>`
    + [0, 0.25, 0.5, 0.75, 1].map(p => {
      const sx = left + p * (right - left);
      const sy = bottom - p * (bottom - top);
      return `<path class="chart-grid" d="M${sx},${top} V${bottom} M${left},${sy} H${right}"/>
      <text class="chart-tick" x="${sx}" y="${bottom + 16}" text-anchor="middle">${rounded(x.low + p * (x.high - x.low))}</text>
      <text class="chart-tick" x="${left - 7}" y="${sy + 4}" text-anchor="end">${rounded(y.low + p * (y.high - y.low))}</text>`;
    }).join('')
    + `<text class="chart-tick" x="270" y="287" text-anchor="middle">${escapeHTML(xLabel)}</text>
       <text class="chart-tick" x="51" y="15">${escapeHTML(yLabel)}</text>`;
}

export function plotHTML({ title, points, mode, xLabel = 'x', yLabel = 'y' }) {
  const x = scale(points, 0, frame.left, frame.right);
  const y = scale(points, 1, frame.bottom, frame.top);
  const positions = points.map(([px, py]) => `${x.at(px)},${y.at(py)}`);
  const path = mode === 'line' ? `<polyline class="plot-line" points="${positions.join(' ')}"/>` : '';
  const dots = points.map(([px, py], index) =>
    `<circle class="plot-dot" data-point="${index}" cx="${x.at(px)}" cy="${y.at(py)}" r="4"><title>(${px}, ${py})</title></circle>`).join('');
  const initial = `Point 1 of ${points.length} · (${points[0].join(', ')})`;
  return `<figure class="visual-card">
    <figcaption>${escapeHTML(title)}</figcaption>
    ${svgFrame(title, grid(x, y, xLabel, yLabel) + path + dots)}
    ${points.length > 1 ? `<label class="visual-control">Inspect point <input data-plot type="range" min="0" max="${points.length - 1}" value="0"></label>` : ''}
    <p class="visual-output" aria-live="polite">${initial}</p>
  </figure>`;
}

export function projectionState(points, angle) {
  const mean = [0, 1].map(key => points.reduce((sum, point) => sum + point[key], 0) / points.length);
  const centered = points.map(([x, y]) => [x - mean[0], y - mean[1]]);
  const radius = (Math.max(...centered.map(([x, y]) => Math.hypot(x, y))) || 1) * 1.12;
  const radians = angle * Math.PI / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const scores = centered.map(([x, y]) => x * ux + y * uy);
  return { centered, scores, ux, uy, radius, variance: scores.reduce((sum, score) => sum + score ** 2, 0) / points.length };
}

function projectionGraphic(points, angle, title) {
  const { centered, scores, ux, uy, radius, variance } = projectionState(points, angle);
  const unit = 103 / radius;
  const x = value => 260 + value * unit;
  const y = value => 133 - value * unit;
  const axis = `<path class="chart-grid" d="M140,133 H380 M260,14 V252"/>
      <path class="projection-axis" d="M${x(-radius * ux)},${y(-radius * uy)} L${x(radius * ux)},${y(radius * uy)}"/>`;
  const dots = centered.map(([px, py], index) => {
    const sx = x(scores[index] * ux);
    const sy = y(scores[index] * uy);
    return `<path class="projection-drop" d="M${x(px)},${y(py)} L${sx},${sy}"/>
      <circle class="plot-dot" cx="${x(px)}" cy="${y(py)}" r="4"/>
      <circle class="projected-dot" cx="${sx}" cy="${sy}" r="4"/>`;
  }).join('');
  return {
    graphic: svgFrame(title, axis + dots, '105 8 310 252'),
    readout: `${angle}° · Projected variance ${rounded(variance)}`,
  };
}

export function projectionHTML({ title, points, angle = 0 }) {
  const { graphic, readout } = projectionGraphic(points, angle, title);
  return `<figure class="visual-card" data-projection="${escapeHTML(JSON.stringify(points))}">
    <figcaption>${escapeHTML(title)}</figcaption>
    <div class="projection-graphic">${graphic}</div>
    <label class="visual-control">Rotate projection axis <input data-angle type="range" min="0" max="180" value="${angle}"></label>
    <p class="visual-output" aria-live="polite">${readout}</p>
  </figure>`;
}

export function updateProjection(card, points, angle) {
  const { graphic, readout } = projectionGraphic(points, angle, card.querySelector('figcaption').textContent);
  card.querySelector('.projection-graphic').innerHTML = graphic;
  card.querySelector('.visual-output').textContent = readout;
}

export function diagramHTML({ title, nodes, edges }) {
  const rowWidth = 3;
  const columns = Math.min(nodes.length, rowWidth);
  const width = 34 + columns * 216;
  const height = 24 + Math.ceil(nodes.length / rowWidth) * 111;
  const position = new Map(nodes.map((node, i) => [node.id, {
    x: 24 + i % rowWidth * 216,
    y: 16 + Math.floor(i / rowWidth) * 111,
  }]));
  const labels = new Map(nodes.map(({ id, label }) => [id, label]));
  const arrows = edges.map(({ from, to, label }, index) => {
    const start = position.get(from);
    const end = position.get(to);
    const color = COLORS[index % COLORS.length];
    const sx = start.x + 85;
    const sy = start.y + 58;
    const ex = end.x + 85;
    const ey = end.y;
    const sameRow = start.y === end.y && from !== to;
    const path = sameRow
      ? `M${start.x + (start.x < end.x ? 170 : 0)},${start.y + 29} H${end.x + (start.x < end.x ? 0 : 170)}`
      : `M${sx},${sy} C${sx + 28},${sy + 40} ${ex + 28},${ey - 40} ${ex},${ey}`;
    const tipX = sameRow ? end.x + (start.x < end.x ? 0 : 170) : ex;
    const tipY = sameRow ? end.y + 29 : ey;
    const arrow = sameRow
      ? `M${tipX + (start.x < end.x ? -7 : 7)},${tipY - 4} L${tipX},${tipY} L${tipX + (start.x < end.x ? -7 : 7)},${tipY + 4}`
      : `M${tipX},${tipY - 8} L${tipX},${tipY} L${tipX + 8},${tipY - 3}`;
    return `<g><title>${escapeHTML(labels.get(from))} → ${escapeHTML(labels.get(to))}${label ? ` · ${escapeHTML(label)}` : ''}</title><path d="${path} ${arrow}" fill="none" stroke="${color}" stroke-width="2"/></g>`;
  }).join('');
  const boxes = nodes.map(({ id, label }) => {
    const { x, y } = position.get(id);
    const lines = label.match(/.{1,21}(?:\s+|$)|.{1,21}/gu) ?? [label];
    return `<g><rect class="diagram-node" x="${x}" y="${y}" width="170" height="58" rx="9"/>
      <text class="diagram-label" x="${x + 85}" text-anchor="middle" y="${y + 33 - (lines.length - 1) * 7}">${lines.map((line, i) => `<tspan x="${x + 85}" dy="${i ? 14 : 0}">${escapeHTML(line.trim())}</tspan>`).join('')}</text></g>`;
  }).join('');
  const list = edges.length ? `<ul>${edges.map(({ from, to, label }) =>
    `<li>${escapeHTML(labels.get(from))} → ${escapeHTML(labels.get(to))}${label ? ` · ${escapeHTML(label)}` : ''}</li>`).join('')}</ul>` : '';
  return `<figure class="visual-card"><figcaption>${escapeHTML(title)}</figcaption>
    <div class="diagram-scroll" tabindex="0" role="region" aria-label="Scrollable diagram">${svgFrame(title, boxes + arrows, `0 0 ${width} ${height}`, 'diagram-svg')}</div>
    ${list ? `<details class="diagram-description"><summary>Read connections</summary>${list}</details>` : ''}</figure>`;
}
