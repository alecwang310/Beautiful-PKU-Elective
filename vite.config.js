import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { transform as minifyCss } from 'lightningcss';

// Minify the css`…` template literals at build time: comments and whitespace
// are stripped so the styles ship as a single line, while the source keeps its
// comments for reading. The ${C.xxx} palette interpolations are JS, not CSS,
// so they are swapped for a unique var() token lightningcss can parse, then
// swapped back after minification.
function minifyCssTemplates() {
  return {
    name: 'minify-css-templates',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.js$/.test(id)) return;
      if (!code.includes('const css = String.raw')) return;

      const out = code.replace(/css`([\s\S]*?)`/g, (full, css) => {
        const names = new Map();
        const prepped = css.replace(/\$\{C\.(\w+)\}/g, (m, name) => {
          if (!names.has(name)) names.set(name, '--pkuInterp' + names.size);
          return 'var(' + names.get(name) + ')';
        });
        let min = minifyCss({
          filename: 'style.css',
          code: Buffer.from(prepped),
          minify: true,
        }).code.toString();
        for (const [name, token] of names) {
          min = min.replaceAll('var(' + token + ')', '${C.' + name + '}');
        }
        return 'css`' + min + '`';
      });

      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [
    minifyCssTemplates(),
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'Beautiful PKU Elective',
        namespace: 'beautiful.pku.elective.v1',
        version: '1.1.0',
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
