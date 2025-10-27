// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/journey-visualizer.js',
      format: 'esm'
    },
    {
      file: 'dist/journey-visualizer.umd.js',
      format: 'umd',
      name: 'JourneyVisualizer'
    }
  ],
  plugins: [
    resolve(),
    commonjs()
  ],
  external: ['dagre', '@panzoom/panzoom']
};
