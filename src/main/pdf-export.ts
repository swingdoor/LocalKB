import type { WebContents } from 'electron'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPdfHtml(title: string, htmlContent: string): string {
  const safeTitle = escapeHtml(title || '文档')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 40px;
      line-height: 1.6;
      color: #333;
      overflow-wrap: anywhere;
    }
    h1 { font-size: 28px; margin: 0 0 20px; }
    h2 { font-size: 22px; margin-top: 24px; }
    h3 { font-size: 18px; margin-top: 20px; }
    p { margin: 12px 0; }
    ul, ol { padding-left: 24px; }
    li { margin: 6px 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
      margin: 16px 0;
    }
    thead { display: table-header-group; }
    tr, img, pre, blockquote, details, [data-pdf-resource-frame] {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th { background: #f4f4f4; font-weight: 600; }
    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 16px;
      margin: 16px 0;
      color: #666;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', monospace;
    }
    pre {
      background: #f4f4f4;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    img, svg { max-width: 100%; }
    [data-pdf-resource-frame] > svg {
      display: block;
      width: 100%;
      height: 100%;
      max-height: 100%;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${htmlContent}
</body>
</html>`
}

export async function waitForPdfLayout(webContents: WebContents): Promise<void> {
  await webContents.executeJavaScript(`
    (async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()
  `)
}
