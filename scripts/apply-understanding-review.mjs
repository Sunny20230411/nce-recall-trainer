import { readFile, writeFile } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';
const path = 'content/sentence-understanding.pilot.v1.json';
const content = JSON.parse(await readFile(path, 'utf8'));
const review = JSON.parse(await readFile('content/sentence-understanding.pilot-review.v1.json', 'utf8'));
for (const { sentenceId, english, wordOverrides = {}, ...corrections } of review.reviews) {
  const record = content.records.find(item => item.sentenceId === sentenceId);
  if (!record || record.english !== english) throw Error(`Review source mismatch: ${sentenceId}`);
  if (record.analysisSource === 'human') continue;
  Object.assign(record, corrections, { analysisSource: 'human', analysisStatus: 'approved' });
  for (const [index, fields] of Object.entries(wordOverrides)) Object.assign(record.words[Number(index)], fields);
  const errors = validateUnderstanding(record);
  if (errors.length) throw Error(`${sentenceId}: ${errors.join('; ')}`);
}
await writeFile(path, JSON.stringify(content, null, 2) + '\n');
console.log(`Applied explicit editorial reviews for ${review.reviews.length} pilot sentences.`);
