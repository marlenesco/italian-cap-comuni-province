import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
// @ts-expect-error The build helper is native Node.js ESM, outside the public TS API.
import { buildData } from './scripts/data/build.mjs';

const datasets = ['gi_comuni_cap', 'gi_province', 'gi_regioni'];

export default defineConfig(() => {
  buildData();
  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    target: 'es2020',
    outDir: 'dist',
    splitting: false,
    bundle: true,
    external: [],
    treeshake: true,
    ignoreWatch: ['src/generated'],
    esbuildPlugins: [{
      name: 'local-tabular-assets',
      setup(build) {
        build.onStart(() => { buildData(); });
        // A tiny CJS bridge loads the same JSON from both module formats.
        // Native Node ESM JSON attributes differ across supported Node releases.
        build.onResolve({ filter: /\/generated\/gi_.*\.json$/ }, (args) => {
          const name = datasets.find((dataset) => args.path.endsWith(`/${dataset}.json`));
          return name ? { path: `./${name}.cjs`, external: true } : undefined;
        });
      },
    }],
    onSuccess: async () => {
      for (const name of datasets) {
        copyFileSync(resolve('src/generated', `${name}.json`), resolve('dist', `${name}.json`));
        writeFileSync(resolve('dist', `${name}.cjs`), `module.exports = require('./${name}.json');\n`);
      }
    },
  };
});
