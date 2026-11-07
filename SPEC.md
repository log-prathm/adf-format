# ADF 1.0 specification

An ADF file is one UTF-8 JSON object saved with the `.adf` extension. ADF describes document content and built-in interactions. Readers can implement the format independently of this compiler.

## Document

| Field | Required | Meaning |
| --- | --- | --- |
| `adf` | Yes | Version string. This specification defines `"1.0"`. |
| `title` | Yes | Document title, up to 180 characters. |
| `description` | | Short plain-text summary. |
| `source` | | Object with `kind` and an optional HTTPS `url`. Kinds are `agent`, `markdown`, `chatgpt-ui`, and `chatgpt-export`. |
| `warnings` | | Plain-text conversion notes to show the reader. |
| `blocks` | Yes | Nonempty ordered array of blocks. |

Unknown fields and block types are errors in 1.0. Use the [normative JSON Schema](schema/adf-1.0.schema.json) for field names, structural rules, and limits. A reader also checks that quiz answers index an existing choice, diagram node IDs are unique, and edges reference existing nodes. The reference reader accepts up to 32 MiB per input and 24 nested JSON value levels, counting the root as level zero.

## Blocks

All blocks have a `type` string. Only Markdown content fields are interpreted as markup. Every other text field is plain text.

| `type` | Required fields | Optional fields and behavior |
| --- | --- | --- |
| `markdown` | `text` | GitHub Flavored Markdown with fenced code, tables, and TeX delimiters. |
| `math` | `tex` | Display TeX without surrounding delimiters. |
| `message` | `role`, `blocks` | The role is `user` or `assistant`. Nested blocks retain document order. |
| `details` | `title`, `blocks` | `open` defaults to false. |
| `quiz` | `prompt`, `choices`, `answer` | One correct choice. `answer` is zero-based. Optional `explanation` is Markdown. |
| `plot` | `title`, `points` | Each point is `[x, y]`. `mode` is `scatter` (default) or `line`. Line mode connects points in input order. Optional `xLabel`, `yLabel` label the axes. |
| `projection` | `title`, `points` | Each point is `[x, y]`. Optional initial `angle` in integer degrees defaults to zero. The reader centers the points, projects them onto `(cos θ, sin θ)`, and displays the mean squared score as the population variance. |
| `diagram` | `title`, `nodes`, `edges` | Nodes have unique `id` and `label`. Edges have `from`, `to`, and an optional `label`. Readers choose the layout. |
| `image` | `src`, `alt` | Base64 data URL for PNG, JPEG, GIF, WebP, or AVIF. Optional plain-text `caption`. |
| `fallback` | `label`, `text` | Visible substitute for an element that requires the original environment. `text` is Markdown. |

### Math and links

Use `$...$` or `\(...\)` for inline math and `$$...$$` or `\[...\]` for display math on separate lines. ADF JSON strings require escaped backslashes. For example, a math block contains `"tex": "\\frac{1}{n}"`. The reference renderer converts supported TeX to MathML and shows unsupported TeX as code.

Render raw Markdown HTML as literal text. Never execute document-supplied scripts, macros with external effects, HTML attributes, or custom widgets. Embed only allowed raster data URLs. Show remote Markdown images as click-to-open links without loading them automatically. Ordinary links may use HTTP(S) or in-document fragments. Treat the source URL as a link the reader can choose to open.

### Offline interaction

A viewer owns all interaction logic. A document carries only data for known components. In the reference reader, the projection slider and quiz operate locally and their interaction state lives in the open page. Standalone HTML embeds the presentation and the reference runtime together. Its static markup is readable in HTML previews, with full controls in a JavaScript-enabled browser.

### ChatGPT interoperability

The ChatGPT adapters are separate from the ADF format. Page capture reads the loaded DOM at the time of capture. Conversation import reads JSON export mappings, follows the current branch when supplied, and includes visible user and assistant turns. Provider-specific elements can become fallback blocks or warning notes. Basic fenced Mermaid flowcharts accept a `flowchart` or `graph` header, standalone labeled nodes, and `-->` edges with optional `|label|` text. Richer Mermaid source is kept as code. Original formatting or interactions can depend on information available only inside ChatGPT.
