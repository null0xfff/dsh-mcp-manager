import fs from 'node:fs';
import assert from 'node:assert/strict';
const version = process.argv[2];
assert.match(version ?? '', /^\d+\.\d+\.\d+$/);
const names = ['config', 'notes', 'management', 'host'];
const targets = Object.fromEntries(names.map(name => [name, `release-${version}-${name}.js`]));
for (const file of [...Object.values(targets), `release-${version}-client.js`]) assert.ok(!fs.existsSync(file), `Immutable generation already exists: ${file}`);
for (const name of names) {
  const source = name === 'host' ? 'index.js' : `${name}.js`;
  let text = fs.readFileSync(source, 'utf8');
  for (const [key, file] of Object.entries(targets)) text = text.replaceAll(`'./${key}.js'`, `'./${file}'`);
  fs.writeFileSync(targets[name], text);
}
const model = fs.readFileSync('form-model.js', 'utf8').replace(/^export\s+/gm, '');
const client = fs.readFileSync('client.js', 'utf8');
const lines = client.split('\n');
assert.match(lines[0], /^import \{.+\} from '\.\/form-model\.js';$/);
assert.equal((client.match(/^import /gm) ?? []).length, 1);
fs.writeFileSync(`release-${version}-client.js`, `(() => {\n${model}\n${lines.slice(1).join('\n')}\n})();\n`);
console.log(`Built immutable ${version} Host and Client modules from reviewed sources.`);
