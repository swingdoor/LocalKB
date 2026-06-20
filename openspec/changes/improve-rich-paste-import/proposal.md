# Change: Improve Rich Paste Import

## Summary

Improve the editor paste experience so content copied from Markdown sources and web pages is inserted as clean, editable rich content instead of raw text or poorly preserved structure.

The editor should continue using TipTap/ProseMirror JSON as the canonical storage format. HTML and Markdown should be treated as input/interchange formats at the paste/import boundary.

## Problem

The current editor is a TipTap rich text editor that stores document content as TipTap JSON. This is a good base format for local editing, custom nodes, images, drawings, mind maps, export, and search.

However, users often copy content from:

- Markdown editors, AI chat output, README files, and documentation
- Web pages, online docs, blogs, and reference material

Today Markdown pasted as plain text remains plain text. Web page paste may preserve only what TipTap can parse from clipboard HTML, and unsupported structures such as tables or complex blocks can degrade.

This creates friction for personal knowledge capture because copied material often needs manual cleanup before it becomes usable.

## Goals

- Keep TipTap JSON as the canonical document content format.
- Preserve the visible reading structure of pasted Markdown and web content.
- Convert Markdown syntax into rich TipTap nodes on paste when appropriate.
- Preserve common web HTML semantics such as headings, lists, links, bold, code, quotes, images, and tables.
- Avoid turning the editor into a full web page clone or arbitrary HTML storage engine.
- Keep pasted content clean, searchable, editable, and exportable.

## Non-Goals

- Do not replace TipTap JSON storage with raw HTML.
- Do not attempt pixel-perfect reproduction of arbitrary web pages.
- Do not preserve scripts, interactive widgets, advertisements, navigation, sidebars, or full page layouts.
- Do not implement a complete Markdown source editor in this change.
- Do not alter Excalidraw or mind map storage models.

## User Experience

When a user pastes Markdown:

```md
# Project Notes

- Item A
- Item B

**Important:** keep this.
```

The editor should insert:

- A level 1 heading
- A bullet list
- Bold inline text

When a user pastes from a web page, the editor should preserve the readable article/document structure:

- Headings
- Paragraphs
- Ordered and unordered lists
- Links
- Inline formatting
- Blockquotes
- Code blocks
- Tables, if present
- Images, subject to the image handling policy

If the pasted text is ordinary plain text that only incidentally contains punctuation, the editor should not aggressively reinterpret it as Markdown.

## Proposed Approach

Use a paste pipeline that chooses the best available clipboard representation:

```text
Clipboard
  |
  +-- text/html present?
  |     |
  |     +-- sanitize HTML
  |     +-- normalize supported tags
  |     +-- insert into TipTap
  |
  +-- otherwise text/plain present
        |
        +-- detect likely Markdown
        |     |
        |     +-- parse Markdown
        |     +-- convert to HTML or TipTap JSON
        |     +-- insert into TipTap
        |
        +-- fallback: insert plain text
```

## Capability Impact

This change introduces or updates an editor paste/import capability.

Expected supported structures:

- Headings h1-h6
- Paragraphs and hard breaks
- Bold, italic, strike, inline code
- Links
- Bullet and ordered lists
- Task lists
- Blockquotes
- Horizontal rules
- Code blocks
- Tables
- Images

## Risks

- Markdown detection may incorrectly transform plain text.
- Web HTML may contain unsafe or noisy markup.
- Remote images may break later if inserted by URL only.
- Tables require adding TipTap table extensions and UI/export styles.
- Pasting very large documents may impact editor performance.

## Open Questions

- Should Markdown paste be automatic, explicit through a "Paste as Markdown" command, or both?
- Should remote web images remain remote URLs, be embedded as base64, or be copied into the local vault?
- Should table editing controls be included immediately or only basic table rendering/editing?
- Should pasted content preserve inline colors and font sizes, or normalize to the app theme?

