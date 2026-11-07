# Agentic Document Format

ADF is a portable, versioned JSON format for interactive documents. Save a ChatGPT conversation, turn it into study notes with an agent, or write a document directly. Read it in a browser and export a single HTML file that runs offline.

## Start here

1. Download this repository using **Code → Download ZIP** and extract it.
2. Open [docs/index.html](docs/index.html) in Chrome, Edge, Firefox, or Safari. There is no install or build step for the viewer.
3. Click **Try the PCA example** to test the projection slider and quiz, or **Choose a file** to open an ADF, Markdown, or ChatGPT conversation JSON file.
4. Choose **Download .adf** to keep the editable source or **Download offline HTML** to share a standalone copy. Use **Print** for a paper or PDF copy.

### PDF-style page reader

Choose **Open page reader** from the viewer, or open [docs/reader.html](docs/reader.html) directly. On the hosted viewer, use [ADF Page Reader](https://adf-viewer.vercel.app/reader.html).

- **Open file** or **Try the PCA example** to start. Use the arrows or type a page number and press Enter.
- **Outline** lists headings. Switch to **Pages** to jump by thumbnail.
- **Find** searches the whole document, including pages outside the current view. You can also use Ctrl+F or Command+F.
- Quizzes, plots, and collapsible sections work inline. Page numbers stay stable as you interact. Pages reflow when the reading width changes, so page counts can differ by device. Phone pages use tighter spacing and expand in place for long blocks or revealed answers. On desktop, a block taller than a page can be scrolled within its page.

The two readers use the same ADF files and keep file processing in the browser. **Import, export, and print** includes the existing agent prompt, JSON paste, and download tools.

### Open on a phone

Use a current mobile browser. Open the viewer, then choose the `.adf` file from your phone’s file picker. A downloaded standalone HTML document includes the document and all of its renderer assets.

- **Android.** Open the HTML with a browser that can read local HTML files. Use the viewer’s file picker to open `.adf` files.
- **iPhone or iPad.** The Files preview can show a standalone document’s text but may suppress its JavaScript controls. For full interaction, open the viewer from an HTTP(S) URL in Safari, then select your local `.adf` file.
- **Serve to a phone from a PC.** In the repository folder, run `python3 -m http.server 8000 --directory docs`. With both devices on the same Wi-Fi, open `http://PC_LOCAL_IP:8000/` in the phone’s browser. Only the viewer folder is served.
- **Host your own viewer.** In a public GitHub fork, open **Settings → Pages → Deploy from a branch**, select **main** and **/docs**, then save. Open the Pages address after deployment. The viewer reads your documents locally in the browser.

## Convert a ChatGPT chat

### Capture the page in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the extracted [extension](extension/) folder.
3. Open a ChatGPT conversation. Click **ADF ChatGPT Capture → Download conversation**.
4. Open the resulting `.adf` in the viewer.

The extension captures the user and assistant messages loaded in the visible conversation branch. It translates headings, lists, tables, code, links, TeX equations, and eligible embedded raster images. It needs access to the active tab when clicked and processes the conversation locally. It uses ChatGPT’s current page structure, so interface updates can affect capture.

### Import without an extension

- Paste a copied ChatGPT response into **Paste Markdown or ADF JSON**.
- Or request your [ChatGPT data export](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data), unzip it, and open the conversation JSON in the viewer. Choose a conversation if the file contains several. The importer follows the selected branch recorded in the export. The 32 MiB limit applies to each input file.
- Basic Mermaid flowcharts in Markdown or exported messages are converted to diagrams with the original source retained. Unsupported Mermaid syntax stays as source code.

ADF marks provider widgets, unresolved citations, and inaccessible assets with fallbacks when it can identify them. ChatGPT tools, server-backed controls, and native widget state require the original conversation. An agent can recreate known interactions with ADF’s quiz, plot, projection, diagram, and reveal blocks.

## Use the compiler

Install **Node.js 22 or newer**. Run these from the repository root.

```sh
npm ci
npm run adf -- validate examples/pca.adf
npm run adf -- render examples/pca.adf pca.html
```

To convert source files:

```sh
npm run adf -- import-markdown notes.md notes.adf
npm run adf -- list-chatgpt conversations.json
npm run adf -- import-chatgpt conversations.json notes.adf --conversation 1
```

The compiler creates output files exclusively. Give it a fresh filename for each run. `npm run build` rebuilds the viewer and extension after source changes.

## Build ADF documents with an agent

Point the agent at [SKILL.md](SKILL.md), the [format specification](SPEC.md), and the [JSON Schema](schema/adf-1.0.schema.json). For example, “Use SKILL.md to turn this conversation into an ADF lesson. Preserve the derivations and add an interactive check.”

```json
{
  "adf": "1.0",
  "title": "My first ADF document",
  "blocks": [
    { "type": "markdown", "text": "## Hello ADF\n\nAn equation inline: $x^2$." },
    {
      "type": "quiz",
      "prompt": "What is 2 squared?",
      "choices": ["2", "4"],
      "answer": 1
    }
  ]
}
```

See [examples/pca.adf](examples/pca.adf) for a complete lesson with math, a draggable projection axis, and a quiz.

## Develop

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite exercises the offline viewer, a mobile viewport, the capture adapter against a ChatGPT-style page fixture, and the HTML export. Set `ADF_CHROMIUM_PATH` to use an installed compatible Chromium executable.

Project code uses [Apache 2.0](LICENSE). Bundled components retain their [third-party licenses](THIRD_PARTY_NOTICES.md).
