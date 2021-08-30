import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: 'src/bidiMapper/scripts/eval.ts',
    output: {
      file: 'src/.build/scripts/eval.txt',
      sourcemap: true,
      format: 'iife',
    },
    plugins: [
      nodeResolve({ browser: true }),
      typescript({
        tsconfig: 'src/bidiMapper/scripts/tsconfig.json',
      }),
    ],
  },
];
