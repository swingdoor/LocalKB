# Bubble Menu Enhancements Design

**Date:** 2026-04-03  
**Status:** Approved  
**Author:** Claude Opus 4.6

## Overview

Enhance the floating bubble menu in the TipTap editor to support font family selection, font size selection, and heading level switching. All new controls will be integrated into the existing single-row layout.

## Goals

- Add font family selector with Chinese, English, and programming fonts
- Add font size selector with relative size options (small, normal, large, extra large)
- Add heading level selector (paragraph, h1-h6)
- Maintain single-row layout for simplicity
- Preserve existing formatting, alignment, and AI features

## Non-Goals

- Fixed toolbar at editor top
- Custom font upload
- Absolute pixel-based font sizing
- Text color or background color controls

## Design

### UI Layout

The bubble menu will display controls in a single row with visual separators:

```
[Font ▼] [Size ▼] [Heading ▼] | [B] [I] [S] [🔗] | [←] [⊞] [→] [≡] | [✨] [📝]
```

**Groups (left to right):**
1. **Style selectors**: Font family, Font size, Heading level
2. **Text formatting**: Bold, Italic, Strikethrough, Link
3. **Alignment**: Left, Center, Right, Justify
4. **AI tools**: Polish, Expand

### Font Family Selector

**Dropdown options:**
- 默认 (system default)
- 宋体 (SimSun)
- 黑体 (SimHei)
- 楷体 (KaiTi)
- 微软雅黑 (Microsoft YaHei)
- 苹方 (PingFang SC, macOS only)
- Arial
- Times New Roman
- Consolas
- Monaco
- Courier New

**Implementation:**
- Use TipTap's `TextStyle` and `FontFamily` extensions
- Apply via `editor.chain().focus().setFontFamily(fontName).run()`
- Display current font in dropdown when text is selected
- Default shows "默认" when no font is set

### Font Size Selector

**Dropdown options:**
- 小 (12px)
- 正常 (16px, default)
- 大 (20px)
- 特大 (24px)

**Implementation:**
- Use TipTap's `TextStyle` extension with custom `fontSize` attribute
- Apply via `editor.chain().focus().setMark('textStyle', { fontSize: '16px' }).run()`
- Display current size in dropdown when text is selected
- Default shows "正常" when no size is set

### Heading Level Selector

**Dropdown options:**
- 正文 (paragraph)
- 标题 1 (h1)
- 标题 2 (h2)
- 标题 3 (h3)
- 标题 4 (h4)
- 标题 5 (h5)
- 标题 6 (h6)

**Implementation:**
- Use existing `toggleHeading({ level })` and `setParagraph()` commands
- Detect current heading level via `editor.isActive('heading', { level })`
- Detect paragraph via `editor.isActive('paragraph')`
- Display current level in dropdown

## Technical Details

### TipTap Extensions Required

**New extensions to add:**
1. `@tiptap/extension-text-style` - Base for inline styling
2. `@tiptap/extension-font-family` - Font family support

**Custom configuration:**
- Extend `TextStyle` to support `fontSize` attribute
- Configure `FontFamily` with the font list

### Component Structure

**BubbleMenu.tsx modifications:**
- Add three new dropdown components: `FontFamilyDropdown`, `FontSizeDropdown`, `HeadingDropdown`
- Each dropdown shows current value and updates on selection change
- Dropdowns use consistent styling with existing buttons
- Add visual separators (vertical lines) between groups

### State Management

- Dropdowns read current state from `editor.getAttributes('textStyle')` and `editor.isActive()`
- Changes apply immediately via TipTap commands
- No additional React state needed (TipTap manages editor state)

### Styling

**Dropdown appearance:**
- Width: auto-fit content, max 120px
- Height: 32px (match existing buttons)
- Border: 1px solid with theme color
- Background: white/theme background
- Hover: subtle background change
- Font: 14px, same as existing UI

**Dropdown menu:**
- Position: below the trigger button
- Max height: 300px with scroll
- Z-index: higher than bubble menu
- Shadow: subtle drop shadow
- Item hover: background highlight

## Data Flow

1. User selects text in editor
2. Bubble menu appears with current formatting state
3. User clicks dropdown (font/size/heading)
4. Dropdown opens with current value highlighted
5. User selects new value
6. TipTap command executes: `editor.chain().focus().setFontFamily(value).run()`
7. Editor updates, dropdown closes
8. Bubble menu reflects new state

## Edge Cases

1. **Mixed formatting in selection**: Show placeholder text like "混合" or first detected value
2. **No text selected**: Bubble menu doesn't appear (existing behavior)
3. **Image selected**: Show image menu instead (existing behavior)
4. **Font not available on system**: Fallback to system default
5. **Heading with font/size**: Font and size should work on headings too
6. **List items**: Font and size should work in lists

## Testing Considerations

- Test font rendering across Windows/macOS
- Test dropdown z-index with other UI elements
- Test keyboard navigation in dropdowns
- Test undo/redo with font/size changes
- Test copy/paste preserves font/size
- Test export to PDF includes font/size styling

## Implementation Notes

- Install dependencies: `npm install @tiptap/extension-text-style @tiptap/extension-font-family`
- Font families must be available in system or loaded via CSS
- Font size uses px units for consistency
- Heading selector reuses existing heading commands (no new extension needed)

## Future Enhancements (Out of Scope)

- Text color picker
- Background color/highlight
- Custom font upload
- Line height control
- Letter spacing
- More granular font sizes
