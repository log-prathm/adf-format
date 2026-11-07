// Translate a portable subset and let the caller keep the source for anything richer.
const nodeSyntax = /^(?<id>[A-Za-z][\w-]*?)(?=\s|\[|\(|\{|-->|$)(?:\["?(?<box>[^\]"\n]+)"?\]|\("?(?<round>[^)"\n]+)"?\)|\{"?(?<diamond>[^}"\n]+)"?\})?[ \t]*/;
const edgeSyntax = /^-->[ \t]*(?:\|([^|\n]+)\|[ \t]*)?/;

export function mermaidDiagram(source) {
  const [header, ...lines] = source.trim().split(/\r?\n/);
  if (!/^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?$/.test(header)) return null;
  const nodes = new Map();
  const edges = [];
  for (const line of lines) {
    let rest = line.trim().replace(/;$/, '').trim();
    if (!rest || rest.startsWith('%%')) continue;
    let from;
    let edge;
    while (rest) {
      const node = nodeSyntax.exec(rest);
      if (!node) return null;
      const { id, box, round, diamond } = node.groups;
      const label = (box ?? round ?? diamond)?.trim();
      if (id.length > 64 || (label && (label.length > 65 || /[<>]/.test(label)))) return null;
      if (label || !nodes.has(id)) nodes.set(id, label || id);
      if (from) edges.push({ from, to: id, ...(edge?.[1] && { label: edge[1].trim() }) });
      rest = rest.slice(node[0].length);
      if (!rest) break;
      edge = edgeSyntax.exec(rest);
      if (!edge || edge[1] && (!edge[1].trim() || edge[1].trim().length > 65)) return null;
      rest = rest.slice(edge[0].length);
      if (!rest) return null;
      from = id;
    }
  }
  if (!nodes.size || nodes.size > 40 || edges.length > 100) return null;
  return {
    type: 'diagram', title: 'Flowchart',
    nodes: Array.from(nodes, ([id, label]) => ({ id, label })), edges,
  };
}
