const esbuild = require('esbuild')

esbuild.buildSync({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'es2020',
  outfile: 'dist/preload/index.js',
  external: ['electron'],
  format: 'cjs',
})
