import schema from '../schema/adf-1.0.schema.json' with { type: 'json' };

export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_DEPTH = 24;

const blockSchemas = new Map(schema.$defs.block.oneOf.map(({ $ref }) => {
  const definition = schema.$defs[$ref.split('/').at(-1)];
  return [definition.properties.type.const, definition];
}));

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function check(value, rule, path, depth) {
  if (depth > MAX_DEPTH) fail(path, 'document is nested too deeply');

  if (rule.$ref) {
    const name = rule.$ref.split('/').at(-1);
    const definition = name === 'block' ? blockSchemas.get(value?.type) : schema.$defs[name];
    if (!definition) fail(path, `unknown block type ${JSON.stringify(value?.type)}`);
    check(value, definition, path, depth);
    return;
  }

  if (Object.hasOwn(rule, 'const') && value !== rule.const) {
    fail(path, `expected ${JSON.stringify(rule.const)}`);
  }
  if (rule.enum && !rule.enum.includes(value)) fail(path, `expected one of ${rule.enum.join(', ')}`);

  switch (rule.type) {
    case 'object':
      if (typeof value !== 'object' || !value || Array.isArray(value)) fail(path, 'expected object');
      for (const key of rule.required) {
        if (!Object.hasOwn(value, key)) fail(path, `missing "${key}"`);
      }
      for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(rule.properties, key)) fail(path, `unexpected field "${key}"`);
        check(item, rule.properties[key], `${path}.${key}`, depth + 1);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) fail(path, 'expected array');
      if (value.length < rule.minItems || value.length > rule.maxItems) {
        fail(path, `expected ${rule.minItems}–${rule.maxItems} items`);
      }
      value.forEach((item, index) => check(item, rule.items, `${path}[${index}]`, depth + 1));
      break;
    case 'string': {
      if (typeof value !== 'string') fail(path, 'expected string');
      let length = value.length;
      if (length > rule.maxLength && length <= rule.maxLength * 2) length = Array.from(value).length;
      if (length < rule.minLength || length > rule.maxLength) {
        fail(path, `expected ${rule.minLength}–${rule.maxLength} characters`);
      }
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail(path, 'invalid value');
      break;
    }
    case 'integer':
    case 'number':
      if (!Number.isFinite(value) || (rule.type === 'integer' && !Number.isInteger(value))) {
        fail(path, `expected finite ${rule.type}`);
      }
      if (value < rule.minimum || value > rule.maximum) fail(path, 'value is out of range');
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail(path, 'expected boolean');
      break;
  }

  if (rule === blockSchemas.get('quiz') && value.answer >= value.choices.length) {
    fail(`${path}.answer`, 'must index an existing choice');
  }
  if (rule === blockSchemas.get('diagram')) {
    const ids = new Set(value.nodes.map(node => node.id));
    if (ids.size !== value.nodes.length) fail(`${path}.nodes`, 'node IDs must be unique');
    value.edges.forEach(({ from, to }, index) => {
      if (!ids.has(from) || !ids.has(to)) fail(`${path}.edges[${index}]`, 'edge must refer to existing nodes');
    });
  }
}

export function validate(document) {
  check(document, schema, '$', 0);
  return document;
}

export function parseADF(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('ADF file exceeds 32 MiB.');
  return validate(JSON.parse(text.replace(/^\uFEFF/, '')));
}

export function serializeADF(document) {
  const text = JSON.stringify(validate(document), null, 2) + '\n';
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('ADF file exceeds 32 MiB.');
  return text;
}

export function filename(title) {
  return title.normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 64).toLowerCase() || 'document';
}
