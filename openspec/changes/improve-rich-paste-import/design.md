# Design: Improve Rich Paste Import

## Current State

The editor uses TipTap/ProseMirror through `@tiptap/react`. Document content is loaded from `Document.content` by parsing a JSON string, and saved through `editor.getJSON()`.

```text
Editor DOM
  -> TipTap document model
  -> editor.getJSON()
  -> JSON.stringify(...)
  -> local document JSON file
```

This storage model should remain unchanged.

The missing capability is not storage. The missing capability is an explicit paste/import pipeline for Markdown and richer HTML.

## Recommended Architecture

```text
                         ┌────────────────────────┐
                         │ Clipboard Paste Event  │
                         └───────────┬────────────┘
                                     │
             ┌───────────────────────▼───────────────────────┐
             │             Paste Coordinator                  │
             │  chooses html, markdown, or plain text path    │
             └───────┬───────────────────┬───────────────────┘
                     │                   │
       ┌─────────────▼──────┐   ┌────────▼─────────┐
       │ HTML Paste Pipeline │   │ Markdown Pipeline │
       └─────────────┬──────┘   └────────┬─────────┘
                     │                   │
       ┌─────────────▼──────┐   ┌────────▼─────────┐
       │ sanitize/normalize │   │ parse Markdown   │
       └─────────────┬──────┘   └────────┬─────────┘
                     │                   │
                     └─────────┬─────────┘
                               │
                    ┌──────────▼──────────┐
                    │ TipTap insertContent │
                    └─────────────────────┘
```

## Storage Decision

Keep TipTap JSON as canonical storage.

HTML is useful as:

- Clipboard input
- Sanitized intermediate representation
- Export format

Markdown is useful as:

- Clipboard input
- Import/export format
- Human-readable interchange format

Neither HTML nor Markdown should become the base document format for this application.

## Paste Decision Rules

### 1. HTML available

If `event.clipboardData.getData('text/html')` is available:

- Sanitize it.
- Strip unsafe tags and attributes.
- Normalize common web markup into editor-supported HTML.
- Insert via TipTap.

This path is ideal for web pages and many rich editors because the clipboard already contains semantic HTML.

### 2. Plain text likely Markdown

If no useful HTML is available, inspect `text/plain`.

Treat it as Markdown only when it passes a conservative likelihood check, for example:

- Multiple Markdown block markers are present, or
- A heading/list/code fence/table pattern appears across multiple lines, or
- Strong inline markers appear in context with block structure.

Examples that should likely parse as Markdown:

```text
# Title

- One
- Two
```

```text
```ts
const x = 1
```
```

```text
| Name | Value |
| ---- | ----- |
| A    | 1     |
```

Examples that should likely remain plain text:

```text
#1 priority is follow up
```

```text
Use ** only if needed
```

### 3. Plain text fallback

If the content does not look like Markdown, insert as plain text.

## Sanitization Policy

Allowed structural tags should include:

- `h1` through `h6`
- `p`, `br`, `hr`
- `strong`, `b`, `em`, `i`, `s`, `del`, `code`, `pre`
- `blockquote`
- `ul`, `ol`, `li`
- `a`
- `table`, `thead`, `tbody`, `tr`, `th`, `td`
- `img`

Disallowed content:

- `script`
- `style`
- event handler attributes such as `onclick`
- iframes and embeds
- forms and inputs, except task-list checkboxes if intentionally mapped
- arbitrary classes from web pages

Style handling should be conservative:

- Prefer semantic structure over visual duplication.
- Do not preserve full CSS layout.
- Optionally preserve simple inline marks such as bold, italic, link, inline code.
- Avoid importing external fonts, page colors, or layout classes.

## Markdown Parsing Strategy

Prefer using a maintained Markdown parser instead of handcrafted parsing.

Possible implementation paths:

| Path | Shape | Notes |
| --- | --- | --- |
| Markdown -> HTML -> TipTap | Use a Markdown parser to produce HTML, sanitize, then insert | Simple and aligns with HTML paste path |
| Markdown -> AST -> TipTap JSON | Parse Markdown AST and map nodes directly | More control, more work |
| TipTap markdown extension | Use an existing TipTap markdown integration if suitable | Needs dependency review |

Recommended first implementation:

```text
Markdown text
  -> Markdown parser
  -> sanitized HTML
  -> editor.commands.insertContent(html)
```

This keeps the custom code small and reuses TipTap's existing HTML parser.

## Table Support

Add TipTap table extensions if table paste is part of the first iteration:

- `@tiptap/extension-table`
- `@tiptap/extension-table-row`
- `@tiptap/extension-table-header`
- `@tiptap/extension-table-cell`

Tables should be editable enough for personal notes. Advanced spreadsheet-like behavior is out of scope.

## Image Handling

There are three reasonable image policies:

| Policy | Benefit | Cost |
| --- | --- | --- |
| Keep remote URL | Fast and simple | Image may disappear, privacy/network dependency |
| Embed base64 | Offline friendly | Large document content |
| Copy into vault assets | Best long-term local model | Requires fetch, storage, and path rewriting |

Recommended staged approach:

1. Preserve valid image URLs in initial paste.
2. Add a later option to localize remote images into the vault.

For local clipboard images, preserve the existing image insertion/storage behavior where possible.

## User Control

The safest experience is both automatic and explicit:

- Default paste should preserve rich web HTML.
- Markdown plain text paste should auto-detect conservatively.
- Add a command/menu action later for "Paste as Markdown" or "Import Markdown" when the user wants deterministic conversion.

Keyboard modifier behavior may be useful:

- Normal paste: smart paste
- Plain paste: keep text only

Exact shortcut choices should follow platform conventions.

## Test Strategy

Create focused fixtures for paste conversion:

- Markdown headings, lists, links, bold, code, blockquotes
- Markdown task lists
- Markdown tables
- Web HTML headings, paragraphs, lists, links
- Web HTML table
- Unsafe HTML with scripts/event attributes
- Plain text with Markdown-like punctuation that should not convert

The core paste conversion should be factored so it can be tested without driving the full Electron app.

