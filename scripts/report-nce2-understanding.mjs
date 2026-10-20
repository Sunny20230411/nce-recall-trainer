import { writeFile, mkdir, rename } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';
import { loadPublishedUnderstanding } from './sentence-split-content.mjs';

const published = await loadPublishedUnderstanding();
const sources = published.sources;
const analysesById = new Map(published.records.map(record => [record.sentenceId, record]));
const tips = published.teacherTips.records.filter(tip => tip.courseId === 'nce2');
const byId = new Map(tips.map(tip => [tip.sentenceId, tip]));
const selected = sources.filter(source => source.courseId === 'nce2');
const missingAnalyses = [], missingTips = [], missingAccuracyReview = [], invalidAnalyses = [];
let analyses = 0, renderable = 0;
for (const source of selected) {
  const tip = byId.get(source.sentenceId);
  if (!tip) missingTips.push(source.sentenceId);
  else if (tip.author !== 'human' && tip.accuracyReview?.version !== 'nce2-expression-accuracy-1.0.0') missingAccuracyReview.push(source.sentenceId);
  const record = analysesById.get(source.sentenceId);
  if (!record) { missingAnalyses.push(source.sentenceId); continue; }
  const errors = validateUnderstanding(record);
  if (record.english !== source.english || record.analysisStatus !== 'approved' || !/[\u3400-\u9fff]/u.test(record.chinese)) errors.push('source or approval mismatch');
  if (errors.length) invalidAnalyses.push({ sentenceId: source.sentenceId, errors });
  else { analyses++; if (tip) renderable++; }
}
const complete = !missingAnalyses.length && !missingTips.length && !missingAccuracyReview.length && !invalidAnalyses.length;
const capped = process.argv.includes('--blocked-by-usage-cap') && !complete;
const status = {
  status: complete ? 'complete-awaiting-user-review' : capped ? 'blocked-by-model-account-usage-cap' : 'incomplete-resumable',
  ...(capped ? { errorCode: 'SetLimitExceeded', requiredAction: 'Account owner must raise or disable the configured Ark model usage cap before resuming.' } : {}),
  totalSentences: selected.length, savedTeacherTips: tips.length, remainingTeacherTips: missingTips.length,
  approvedAnalysesIncludingExisting: analyses, remainingAnalyses: missingAnalyses.length,
  accuracyReviewedTips: tips.length - missingAccuracyReview.length, locallyRenderableTeacherTips: renderable,
  codexEditoriallyReviewedTips: tips.filter(tip => tip.editorialAuthor === 'Codex').length,
  directlyAuthoredTips: tips.filter(tip => tip.author === 'Codex').length,
  reviewMethod: 'Mixed API generation and directly authored Codex content, with separate model reviews and Codex editorial self-review; not sentence-by-sentence human verification.',
  missingAnalyses, missingTips, missingAccuracyReview, invalidAnalyses
};
const directory = 'reports/teacher-tip-generation/nce2';
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/status.json.tmp`, JSON.stringify(status, null, 2) + '\n');
await rename(`${directory}/status.json.tmp`, `${directory}/status.json`);
const { missingAnalyses: a, missingTips: b, missingAccuracyReview: c, invalidAnalyses: d, ...summary } = status;
console.log(JSON.stringify({ ...summary, invalidAnalyses: d.length }));
