import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.js',
      userscript: {
        name: 'Beautiful PKU Elective',
        namespace: 'beautiful.pku.elective.v1',
        version: '0.1.0',
        description: 'Modern UI for elective.pku.edu.cn with more powerful features',
        author: 'Alecwang (https://github.com/alecwang310)',
        license: 'MIT',
        match: ['https://elective.pku.edu.cn/*'],
        'run-at': 'document-start',
        grant: ['GM_addStyle'],
      },
    }),
  ],
});