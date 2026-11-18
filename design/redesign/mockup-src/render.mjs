// Turns the canvas artboards in this folder into static HTML under ../screens/.
//   npm i --no-save linkedom && node design/redesign/mockup-src/render.mjs
// The .dc.html files are the canvas's own source: edit them (or the canvas) and
// re-render, rather than patching the output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = path.dirname(fileURLToPath(import.meta.url));

class DCLogic {
  constructor() { this.props = {}; this.state = {}; }
  setState(u) { Object.assign(this.state, u); }
}

function lookup(expr, scope) {
  expr = expr.trim();
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const fill = (str, scope) => str.replace(HOLE, (_, e) => { const v = lookup(e, scope); return v == null ? '' : String(v); });

function processNode(node, scope, doc) {
  if (node.nodeType === 3) {
    if (HOLE.test(node.textContent)) { HOLE.lastIndex = 0; node.textContent = fill(node.textContent, scope); }
    HOLE.lastIndex = 0;
    return [node];
  }
  if (node.nodeType !== 1) return [node];
  const tag = node.tagName.toLowerCase();
  if (tag === 'sc-for') {
    const list = lookup(node.getAttribute('list').replace(/^\{\{|\}\}$/g, ''), scope) || [];
    const as = node.getAttribute('as');
    const out = [];
    list.forEach((item, i) => {
      for (const child of [...node.childNodes]) {
        const clone = child.cloneNode(true);
        out.push(...processNode(clone, { ...scope, [as]: item, $index: i }, doc));
      }
    });
    return out;
  }
  if (tag === 'sc-if') {
    const v = lookup(node.getAttribute('value').replace(/^\{\{|\}\}$/g, ''), scope);
    if (!v) return [];
    const out = [];
    for (const child of [...node.childNodes]) out.push(...processNode(child, scope, doc));
    return out;
  }
  for (const attr of [...node.attributes]) {
    const n = attr.name.toLowerCase();
    if (n.startsWith('on') || n.startsWith('hint-') || n === 'ref') { node.removeAttribute(attr.name); continue; }
    if (attr.value.includes('{{')) node.setAttribute(attr.name, fill(attr.value, scope));
  }
  const kids = [...node.childNodes];
  for (const child of kids) {
    const repl = processNode(child, scope, doc);
    if (repl.length === 1 && repl[0] === child) continue;
    for (const r of repl) node.insertBefore(r, child);
    node.removeChild(child);
  }
  return [node];
}

export function render(file, { theme, title } = {}) {
  const src = fs.readFileSync(file, 'utf8');
  const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const markup = src.split('</helmet>')[1].split('</x-dc>')[0];
  const js = src.split('data-dc-script')[1].split('>').slice(1).join('>').split('</script>')[0];
  const Component = new Function('DCLogic', js + '; return Component;')(DCLogic);
  const c = new Component();
  c.props = theme ? { theme } : {};
  const vals = c.renderVals();
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${markup}</body></html>`);
  const body = document.body;
  for (const child of [...body.childNodes]) {
    const repl = processNode(child, vals, document);
    if (repl.length === 1 && repl[0] === child) continue;
    for (const r of repl) body.insertBefore(r, child);
    body.removeChild(child);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title || 'The Liner Note redesign'}</title>
<!-- Static render of a redesign mockup. Generated: edit ../mockup-src/ and re-render. -->
${helmet.trim()}
<style>html,body{margin:0;background:${vals.t.bg}}body{display:flex;justify-content:center}</style>
</head>
<body>
${body.innerHTML.trim()}
</body>
</html>
`;
}

export const SCREENS = [
  ['Main', '01-home', 'Home'], ['Search', '02-search', 'Search'],
  ['Album', '03-album', 'Album, before you log it'], ['AlbumLogged', '04-album-logged', 'Album, logged'],
  ['Collection', '05-collection', 'Collection overview'], ['Browse', '06-browse', 'Browse'],
  ['BrowseLoading', '07-first-load', 'Browse, first load'], ['Stats', '08-stats', 'Stats for a slice'],
  ['BoxSheet', '09-box-sheet', 'Put it in a box (later)'],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(HERE, '..', 'screens');
  fs.mkdirSync(out, { recursive: true });
  for (const [src, name, title] of SCREENS) {
    fs.writeFileSync(path.join(out, name + '.html'), render(path.join(HERE, src + '.dc.html'), { title }));
  }
  console.log('rendered', SCREENS.length, 'screens');
}
