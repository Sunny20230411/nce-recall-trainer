import { readFile, writeFile } from 'node:fs/promises';
const inventory = JSON.parse(await readFile('reports/phonetics/inventory.json', 'utf8'));
const editorial = JSON.parse(await readFile('content/british-phonetics.editorial.v1.json', 'utf8'));
const corrections = new Map(editorial.records.map(record => [record.key, record]));
const entries = {}, unresolved = [], cases = [];
for (const group of inventory.groups) {
  let record = JSON.parse(await readFile(`content/british-phonetics/${Buffer.from(group.key).toString('base64url')}.json`, 'utf8'));
  if (record.key !== group.key || !['verified', 'unresolved'].includes(record.status) || record.reviewMethod !== 'model-second-pass') throw Error(`Unreviewed case: ${group.key}`);
  if (record.status === 'verified' && (record.ipa.split(' 或 ').some(form => !/^\/[^/\n]+\/$/.test(form) || /[\u4e00-\u9fff]/.test(form)) || /oʊ|ɝ|ɚ|\*/.test(record.ipa))) throw Error(`Invalid British IPA: ${group.key}`);
  if (corrections.has(group.key)) record = { ...record, ...corrections.get(group.key), status: 'verified', reviewMethod: 'editorial-review' };
  if (record.status === 'verified') record.ipa = [...new Set(record.ipa.split(' 或 '))].join(' 或 ');
  entries[group.key] = record.status === 'verified' ? record.ipa : '';
  if (record.status === 'unresolved') unresolved.push({ ...group, note: record.note });
  cases.push({ ...group, ...record });
}
const normalize = word => String(word).toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
let changed = 0, unresolvedOccurrences = 0;
for (const occurrence of inventory.occurrences) {
  const word = normalize(occurrence.word);
  const key = `${word}|${occurrence.english}`;
  const ipa = Object.hasOwn(entries, `${key}|${occurrence.index}`) ? entries[`${key}|${occurrence.index}`] : Object.hasOwn(entries, key) ? entries[key] : entries[word];
  if (ipa === '') unresolvedOccurrences++;
  else if (ipa !== undefined && ipa !== occurrence.ipa) changed++;
}
const summary = { revision: 1, sentences: inventory.sentences, tokens: inventory.occurrences.length, cases: cases.length, changedOccurrences: changed, unresolvedCases: unresolved.length, unresolvedOccurrences, reviewMethod: 'model-generation-and-independent-model-review-not-human-dictionary-verification' };
await writeFile('content/british-phonetics.audit.v1.json', JSON.stringify({ ...summary, cases, unresolved }, null, 2) + '\n');
await writeFile('assets/british-phonetics-data.js', `// Generated offline; see content/british-phonetics.audit.v1.json.\nwindow.BRITISH_PHONETICS = ${JSON.stringify({ ...summary, entries })};\n`);
console.log(JSON.stringify(summary));
