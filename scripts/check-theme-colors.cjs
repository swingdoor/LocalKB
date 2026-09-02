const fs = require('fs')
const path = require('path')

const rendererRoot = path.join(process.cwd(), 'src', 'renderer')
const shellFiles = [
  'App.tsx',
  'components/TitleBar.tsx',
  'components/Sidebar.tsx',
  'components/DocumentTree.tsx',
  'components/SearchModal.tsx',
  'components/SettingsModal.tsx',
  'components/Editor.tsx',
  'components/TocPanel.tsx',
]

const uiRoot = path.join(rendererRoot, 'components', 'ui')
const uiFiles = fs.readdirSync(uiRoot)
  .filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => path.join('components', 'ui', name))

const lightOnly = /\b(?:bg-white|text-black|bg-black(?:\/\d+)?|(?:bg|text|border)-(?:gray|slate|zinc)-\d+)\b|#[0-9a-f]{3,8}\b/ig
const failures = []

for (const relative of [...shellFiles, ...uiFiles]) {
  const file = path.join(rendererRoot, relative)
  const source = fs.readFileSync(file, 'utf8')
  source.split('\n').forEach((line, index) => {
    const matches = line.match(lightOnly)
    if (matches) failures.push(`${relative}:${index + 1}: ${matches.join(', ')}`)
  })
}

if (failures.length) {
  console.error('First-party Shell contains light-only presentation colors:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  console.error('Use semantic tokens. Content palettes, third-party internals, fixtures, and export-owned themes are intentionally outside this scan.')
  process.exit(1)
}

console.log(`Theme color scan passed (${shellFiles.length + uiFiles.length} first-party Shell/UI files).`)
