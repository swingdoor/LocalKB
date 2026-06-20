# Editor Paste Specification

## ADDED Requirements

### Requirement: Canonical Editor Storage Remains TipTap JSON

The system SHALL continue to store rich document content as TipTap/ProseMirror JSON serialized into the document content field.

#### Scenario: Save after smart paste

- **GIVEN** a user pastes Markdown or web content into a document
- **WHEN** the document is saved
- **THEN** the saved document content SHALL be serialized TipTap JSON
- **AND** the saved document content SHALL NOT be raw Markdown or raw clipboard HTML

### Requirement: Preserve Web Clipboard HTML Semantics

The editor SHALL use sanitized clipboard HTML when rich HTML is available from the clipboard.

#### Scenario: Paste article content from a web page

- **GIVEN** the clipboard contains `text/html` with headings, paragraphs, links, and lists
- **WHEN** the user pastes into the editor
- **THEN** the editor SHALL insert corresponding rich document nodes
- **AND** the inserted content SHALL remain editable

#### Scenario: Paste unsafe HTML

- **GIVEN** the clipboard HTML contains scripts or event handler attributes
- **WHEN** the user pastes into the editor
- **THEN** unsafe scripts and event handlers SHALL be removed
- **AND** safe textual and semantic content SHOULD be preserved

### Requirement: Parse Likely Markdown on Paste

The editor SHALL parse plain-text clipboard content as Markdown when it is likely to be Markdown.

#### Scenario: Paste Markdown heading and list

- **GIVEN** the clipboard contains plain text Markdown with a heading and bullet list
- **WHEN** the user pastes into the editor
- **THEN** the heading SHALL become a heading node
- **AND** the bullet lines SHALL become a bullet list

#### Scenario: Paste Markdown inline marks

- **GIVEN** the clipboard contains likely Markdown with bold, italic, link, or inline code syntax
- **WHEN** the user pastes into the editor
- **THEN** supported inline Markdown syntax SHALL become corresponding rich text marks

### Requirement: Avoid Over-Aggressive Markdown Conversion

The editor SHALL avoid converting ordinary plain text into rich Markdown when the text is not likely to be Markdown.

#### Scenario: Paste ordinary text with Markdown-like punctuation

- **GIVEN** the clipboard contains ordinary text such as `#1 priority is follow up`
- **WHEN** the user pastes into the editor
- **THEN** the text SHALL be inserted as plain text
- **AND** it SHALL NOT become a heading

### Requirement: Support Common Pasted Structures

The paste pipeline SHALL preserve common document structures supported by the editor schema.

#### Scenario: Paste supported structures

- **GIVEN** clipboard content contains supported structures such as headings, paragraphs, lists, blockquotes, code blocks, links, horizontal rules, images, or tables
- **WHEN** the user pastes into the editor
- **THEN** supported structures SHALL be preserved as editable rich content where possible

### Requirement: Graceful Fallback

The editor SHALL preserve user content even when rich conversion fails.

#### Scenario: Conversion error

- **GIVEN** clipboard content cannot be safely parsed as HTML or Markdown
- **WHEN** the user pastes into the editor
- **THEN** the editor SHALL insert the available plain text
- **AND** the paste operation SHALL NOT discard the clipboard content

