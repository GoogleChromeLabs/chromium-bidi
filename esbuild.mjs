import {build} from 'esbuild';
import {sync} from 'glob';

build({
  entryPoints: sync('./src/**/*.ts'),
  outbase: './src',
  outdir: './lib/cjs',
  platform: 'browser',
  sourcemap: true,
  format: 'cjs',
  external: [],
});
