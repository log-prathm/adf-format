---
name: adf-format
description: Create, import, validate, or render Agentic Document Format files. Use for portable interactive notes, ChatGPT conversation exports, offline lessons, or when a user asks for an .adf document or ADF HTML.
---

# Agentic Document Format

Use the [ADF specification](SPEC.md), [JSON Schema](schema/adf-1.0.schema.json), and [PCA example](examples/pca.adf). If this file is outside its original repository, find those files and the renderer in [log-prathm/adf-format](https://github.com/log-prathm/adf-format).

1. Determine whether the user wants a faithful transcript, a standalone lesson, or both. Preserve chronological user and assistant turns for transcripts. In a lesson, keep definitions, notation, derivations, examples, and source links needed to read the result independently.
2. For existing Markdown or ChatGPT conversation JSON, use the compiler’s `import-markdown` or `import-chatgpt` command. Use the repository’s capture extension for a loaded ChatGPT page. Use only the content the user has authorized you to convert.
3. Write the `.adf` as UTF-8 JSON with `"adf": "1.0"`, a title, and ordered blocks. Use Markdown for prose, tables, and code. Use TeX for math and escape each backslash in JSON. Prefer native `details`, `quiz`, `plot`, `projection`, and `diagram` blocks when they preserve or explain the original interaction. Quiz answers use zero-based indices.
4. Preserve working links and embed portable raster assets when available. Use a visible `fallback` block or a document warning for unsupported proprietary widgets or missing assets. Recreate an interaction only when its behavior and data are known. Record any meaningful substitutions.
5. In the repository root, install dependencies with `npm ci` and run `npm run adf -- validate /path/to/document.adf`. If the user wants offline HTML, run `npm run adf -- render /path/to/document.adf /path/to/document.html` with a fresh output path. Inspect the key equations, figures, and controls in the generated output.
6. Deliver the editable ADF and any requested compiled output. If Node.js is unavailable, open the ADF with `docs/index.html` in a browser and choose **Download offline HTML**.
