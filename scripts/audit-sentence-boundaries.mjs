import { readFile, writeFile, mkdir } from 'node:fs/promises';

const effective = process.argv.includes('--effective');
const source = JSON.parse(await readFile(`content/understanding-source-index${effective ? '.effective' : ''}.v1.json`, 'utf8'));
if (effective && source.complete !== true) throw Error('Effective boundaries are not complete');
const reportStem = `sentence-boundary-audit${effective ? '.effective' : ''}`;
const candidates = [];
const broad = process.argv.includes('--broad');
for (const record of source.records) {
  // Protect abbreviations without changing character offsets in the original.
  const protect = value => value.replaceAll('.', '\u2060');
  const text = record.english
    .replace(/\b(?:Mr|Mrs|Ms|Dr|St|Prof|Capt|Col|Gen|Rev)\./gi, protect)
    .replace(/\b(?:[A-Z]\.){2,}/g, protect)
    .replace(/\b[ap]\.m\./gi, protect)
    .replace(/\d\.\d/g, protect);
  const pattern = broad
    ? /[.!?](?:["'\u2019\u201d])?\s+(?=["'\u2018\u201c\p{L}])/gu
    : /[.!?](?:["'\u2019\u201d])?\s+(?=["'\u2018\u201cA-Z])/gu;
  const boundaries = [...text.matchAll(pattern)];
  if (!boundaries.length) continue;
  const parts = [];
  let start = 0;
  for (const boundary of boundaries) {
    const end = boundary.index + boundary[0].trimEnd().length;
    parts.push(record.english.slice(start, end));
    start = boundary.index + boundary[0].length;
  }
  parts.push(record.english.slice(start));
  candidates.push({ courseId: record.courseId, lessonId: record.lessonId, sentenceId: record.sentenceId, lesson: record.lesson, english: record.english, candidateParts: parts });
}
const report = {
  sourceRevision: source.revision,
  totalRecords: source.records.length,
  method: 'Punctuation scan with abbreviation protection; candidates require contextual review, especially quoted speech.',
  byCourse: Object.fromEntries(['nce1', 'nce2'].map(courseId => [courseId, { records: source.records.filter(record => record.courseId === courseId).length, candidates: candidates.filter(record => record.courseId === courseId).length }])),
  candidates
};
await mkdir('reports', { recursive: true });
await writeFile(`reports/${reportStem}.${broad ? 'broad' : 'candidates'}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ totalRecords: report.totalRecords, byCourse: report.byCourse }));

if (broad) {
  // These candidates were reviewed against the source: speech attribution stays attached.
  const attributionIds = new Set([
    'nce-1-lesson-117-sentence-002', 'nce-1-lesson-117-sentence-004',
    'nce-1-lesson-117-sentence-006', 'nce-1-lesson-119-sentence-008',
    'nce-1-lesson-119-sentence-014', 'nce-1-lesson-141-sentence-010',
    'nce-2-lesson-001-sentence-014', 'nce-2-lesson-002-sentence-007',
    'nce-2-lesson-002-sentence-014', 'nce-2-lesson-018-sentence-004',
    'nce-2-lesson-019-sentence-004', 'nce-2-lesson-019-sentence-006',
    'nce-2-lesson-019-sentence-008', 'nce-2-lesson-019-sentence-011',
    'nce-2-lesson-025-sentence-013', 'nce-2-lesson-026-sentence-011',
    'nce-2-lesson-040-sentence-009', 'nce-2-lesson-040-sentence-011',
    'nce-2-lesson-041-sentence-001', 'nce-2-lesson-050-sentence-010',
    'nce-2-lesson-068-sentence-014', 'nce-2-lesson-074-sentence-011',
    'nce-2-lesson-095-sentence-003', 'nce-2-lesson-095-sentence-016'
  ]);
  const abbreviationId = 'nce-2-lesson-089-sentence-002';
  const reviewed = candidates.map(record => ({ ...record,
    decision: attributionIds.has(record.sentenceId) || record.sentenceId === abbreviationId ? 'keep-together' : 'propose-split',
    reason: attributionIds.has(record.sentenceId) ? 'Quoted speech and its reporting clause form one sentence.'
      : record.sentenceId === abbreviationId ? 'P. and U. are initials in a theatre company name, not a sentence boundary.'
        : 'Two separately punctuated utterances remain grouped in one practice record.'
  }));
  const issues = reviewed.filter(record => record.decision === 'propose-split');
  const summary = Object.fromEntries(['nce1', 'nce2'].map(courseId => {
    const courseIssues = issues.filter(record => record.courseId === courseId);
    return [courseId, { records: report.byCourse[courseId].records, affectedRecords: courseIssues.length,
      affectedLessons: new Set(courseIssues.map(record => record.lessonId)).size,
      proposedAdditionalUnits: courseIssues.reduce((sum, record) => sum + record.candidateParts.length - 1, 0) }];
  }));
  await writeFile(`reports/${reportStem}.reviewed.json`, JSON.stringify({ sourceRevision: source.revision, reviewMethod: 'Codex contextual review of punctuation candidates, not human verification; no course data modified.', summary, reviewed }, null, 2) + '\n');
  const lines = ['新1、新2句子拆分检查清单', '仅检查，未修改课程、解析或学习进度。', '按现有句末标点建议拆分；but、and、because不作为机械拆分依据。', '引语后的said/asked等报告语与引语保留在一起。', ''];
  for (const courseId of ['nce1', 'nce2']) {
    const count = summary[courseId];
    lines.push(`${courseId === 'nce1' ? '新1' : '新2'}：检查${count.records}条，${count.affectedLessons}课中发现${count.affectedRecords}条多句合并条目。`, '');
    let lesson = '';
    for (const record of issues.filter(item => item.courseId === courseId)) {
      if (lesson !== record.lesson) { lesson = record.lesson; lines.push(lesson, ''); }
      lines.push(record.sentenceId, `原条目：${record.english}`);
      for (const [index, part] of record.candidateParts.entries()) lines.push(`  ${index + 1}. ${part}`);
      lines.push('');
    }
  }
  await mkdir('exports', { recursive: true });
  await writeFile(`exports/sentence-boundary-audit${effective ? '-r5' : ''}.txt`, '\uFEFF' + lines.join('\r\n'), 'utf8');
  console.log(JSON.stringify({ reviewedSummary: summary, excludedFalsePositives: reviewed.length - issues.length }));
}
