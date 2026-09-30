import { readFile, writeFile } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';
const path = 'content/sentence-understanding.pilot.v1.json';
const content = JSON.parse(await readFile(path, 'utf8'));
const frames = JSON.parse(await readFile('content/sentence-understanding.frames.v1.json', 'utf8'));
// Explicit presentation review authorized for these exact sources, not model regeneration.
for (const frame of frames.records) {
  const record = content.records.find(item => item.sentenceId === frame.sentenceId);
  if (!record || record.english !== frame.english) throw Error(`Source changed: ${frame.sentenceId}`);
  Object.assign(record, { comparison: frame.comparison, backbone: frame.backbone, structureNotes: frame.structureNotes });
  const errors = validateUnderstanding(record);
  if (errors.length) throw Error(errors.join('; '));
}
content.revision = Math.max(content.revision, frames.revision);
await writeFile(path, JSON.stringify(content, null, 2) + '\n');
console.log(`Applied reviewed reading order to ${frames.records.length} pilot sentences.`);
