# Tasks: Improve Rich Paste Import

## Discovery

- [x] Confirm target dependencies for Markdown parsing and HTML sanitization.
- [x] Decide whether table support is included in the first implementation.
- [x] Decide initial remote image policy.

## Paste Pipeline

- [x] Add a paste coordinator for editor clipboard events.
- [x] Prefer sanitized `text/html` when available.
- [x] Add conservative Markdown detection for `text/plain`.
- [x] Parse likely Markdown into rich content.
- [x] Fall back to plain text when neither rich HTML nor likely Markdown applies.

## HTML Handling

- [x] Add HTML sanitization.
- [x] Normalize supported tags before insertion.
- [x] Strip unsafe tags, event attributes, scripts, and unsupported layout markup.
- [x] Preserve semantic tags supported by TipTap.

## Markdown Handling

- [x] Add Markdown parser dependency.
- [x] Convert Markdown to sanitized HTML or TipTap JSON.
- [x] Support headings, paragraphs, lists, links, inline marks, blockquotes, code blocks, horizontal rules, task lists, and tables if tables are in scope.

## Editor Schema

- [x] Add TipTap table extensions if table support is included.
- [x] Add styling for pasted tables in editor and PDF export.
- [x] Verify existing custom nodes still serialize and render correctly.

## UX

- [x] Decide whether to add an explicit "Paste as Markdown" command.
- [x] Decide whether plain paste shortcut should bypass smart parsing.
- [x] Add user-facing affordance only if needed; avoid noisy paste confirmations.

## Verification

- [x] Add unit tests for Markdown detection.
- [x] Add conversion tests for Markdown fixtures.
- [x] Add sanitization tests for unsafe HTML.
- [ ] Manually verify paste from common sources: browser article/docs, GitHub Markdown, AI chat Markdown, and plain text.
- [x] Verify saved document content remains TipTap JSON.
- [x] Verify PDF export still renders pasted structures acceptably.

