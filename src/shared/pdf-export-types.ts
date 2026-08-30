export type PdfExportResult =
  | { canceled: true }
  | { canceled: false; revealId: string }
