export const RULE_VERSION = 'understanding-zh-adult-1.0.0';

export function validateUnderstanding(record) {
  const errors = [];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  if (!text(record.english) || !text(record.chinese) || !text(record.intent)) errors.push('english, chinese and intent are required');
  if (!['ai', 'human'].includes(record.analysisSource)) errors.push('invalid analysisSource');
  if (!['generated', 'reviewed', 'approved'].includes(record.analysisStatus)) errors.push('invalid analysisStatus');
  if (!text(record.ruleVersion)) errors.push('ruleVersion is required');
  if (record.comparison != null && (!text(record.comparison.chinese) || !text(record.comparison.english))) errors.push('comparison requires Chinese and English observations');
  if (record.comparison?.steps && (!Array.isArray(record.comparison.steps) || record.comparison.steps.some(step => !text(step.label) || !text(step.text) || !text(step.explanation)))) errors.push('invalid comparison steps');
  if (record.comparison?.takeaway !== undefined && !text(record.comparison.takeaway)) errors.push('invalid comparison takeaway');
  if (record.backbone && (!text(record.backbone.text) || !text(record.backbone.meaning))) errors.push('backbone requires text and meaning');
  if (record.structureNotes && (!Array.isArray(record.structureNotes) || record.structureNotes.some(note => !text(note.title) || !text(note.text)))) errors.push('invalid structureNotes');
  for (const [name, fields] of Object.entries({ parts: ['text', 'meaning', 'relation'], notes: ['title', 'text'], structures: ['text', 'role', 'explanation'], words: ['text', 'meaning', 'pos', 'phonetic'] })) {
    if (!Array.isArray(record[name])) { errors.push(`${name} must be an array`); continue; }
    if (['parts', 'words', 'structures'].includes(name) && !record[name].length) errors.push(`${name} cannot be empty`);
    for (const item of record[name]) if (fields.some(field => !text(item[field]))) errors.push(`${name} contains an incomplete item`);
  }
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  if (Array.isArray(record.parts) && normalize(record.parts.map(part => part.text).join(' ')) !== normalize(record.english)) errors.push('parts must preserve the full original sentence and punctuation');
  if (Array.isArray(record.words) && normalize(record.words.map(word => word.text).join(' ')) !== normalize(record.english)) errors.push('words must preserve source order and punctuation');
  for (const group of record.structures || []) if (text(group.text) && !record.english.includes(group.text)) errors.push('structure text not present in original');
  if (record.analysisStatus === 'approved' && !text(record.reviewNote)) errors.push('approved analysis requires reviewNote');
  return errors;
}

export function recordKey(record) {
  return `${record.courseId}:${record.lessonId}:${record.sentenceId}`;
}
