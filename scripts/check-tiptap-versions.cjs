const packageJson = require('../package.json')

const expectedVersion = packageJson.dependencies['@tiptap/core']
const tiptapDependencies = Object.entries(packageJson.dependencies)
  .filter(([name]) => name.startsWith('@tiptap/'))

if (!expectedVersion || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error('@tiptap/core 必须使用精确版本')
}

if (!packageJson.dependencies['@tiptap/markdown']) {
  throw new Error('缺少 @tiptap/markdown')
}

const mismatches = tiptapDependencies.filter(([, version]) => version !== expectedVersion)
if (mismatches.length > 0) {
  throw new Error(`TipTap 依赖版本不一致：${mismatches.map(([name, version]) => `${name}@${version}`).join(', ')}`)
}

console.log(`TipTap dependencies aligned at ${expectedVersion} (${tiptapDependencies.length} packages)`)
