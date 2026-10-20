import { readFile, readdir } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';
import { teacherTipSourceDigest, loadTeacherTips } from './teacher-tip-content.mjs';
import { TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
import vm from 'node:vm';

export function makeLetterShape(english) {
  return english.split(/\s+/).map(word => {
    let first = true;
    return [...word].map(character => {
      if (!/[\p{L}\p{N}]/u.test(character)) return character;
      if (first) { first = false; return character; }
      return '_';
    }).join('');
  }).join(' ');
}

export async function applySentenceSplits(sources, originals, teacherTips, { requireComplete = true } = {}) {
  const plan = JSON.parse(await readFile('content/sentence-split-plan.v1.json', 'utf8'));
  if (plan.schemaVersion !== '1.0.0' || plan.sourceDigest !== teacherTipSourceDigest(sources)) throw Error('Sentence boundary source changed; review the plan again');
  const authored = new Map();
  let paths = [];
  try { paths = await readdir('content/sentence-splits'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const path of paths.filter(path => path.endsWith('.json')).sort()) {
    const file = JSON.parse(await readFile(`content/sentence-splits/${path}`, 'utf8'));
    const modelReviewed = file.reviewMethod === 'separate-model-request-not-human-verification' && file.reviewStatus === 'model-reviewed-awaiting-user-review';
    if (file.schemaVersion !== '1.0.0' || file.revision !== plan.revision || !file.author || (file.author !== 'Codex' && !modelReviewed) || file.ruleVersion !== TEACHER_TIP_VERSION) throw Error(`Invalid boundary authorship: ${path}`);
    for (const entry of file.records) {
      if (authored.has(entry.parentSentenceId)) throw Error(`Duplicate boundary: ${entry.parentSentenceId}`);
      authored.set(entry.parentSentenceId, { ...entry, provenance: { author: file.author, modelReviewed, reviewNote: file.reviewNote } });
    }
  }
  const byId = new Map(originals.map(record => [record.sentenceId, record]));
  const sourceById = new Map(sources.map(record => [record.sentenceId, record]));
  const parents = new Map(plan.parents.map(record => [record.parentSentenceId, record]));
  for (const id of authored.keys()) if (!parents.has(id)) throw Error(`Unaudited split: ${id}`);
  const context = { window: {} };
  vm.runInNewContext(await readFile('assets/british-phonetics-data.js', 'utf8'), context);
  vm.runInNewContext(await readFile('assets/british-english.js', 'utf8'), context);
  const replacements = new Map(), childTips = [], runtimeParents = [];
  for (const boundary of plan.parents) {
    const entry = authored.get(boundary.parentSentenceId);
    if (!entry) {
      if (requireComplete) throw Error(`Missing authored split: ${boundary.parentSentenceId}`);
      continue;
    }
    const original = byId.get(boundary.parentSentenceId);
    const source = sourceById.get(boundary.parentSentenceId);
    if (!original || !source || original.english !== boundary.parentEnglish || entry.parentEnglish !== boundary.parentEnglish) throw Error(`Split source mismatch: ${boundary.parentSentenceId}`);
    if (original.analysisSource === 'human') throw Error(`Human boundary requires explicit individual review: ${boundary.parentSentenceId}`);
    if (entry.children.length !== 2 || entry.children.map(child => child.english).join(' ') !== original.english) throw Error(`Split does not reconstruct source: ${boundary.parentSentenceId}`);
    let tokenOffset = 0;
    const children = entry.children.map((child, index) => {
      const id = `${source.sentenceId}-part-${String(index + 1).padStart(2, '0')}`;
      if (sourceById.has(id)) throw Error(`Split ID collision: ${id}`);
      if (child.english !== boundary.children[index]) throw Error(`Reviewed boundary changed: ${id}`);
      const count = child.english.split(/\s+/).length;
      const offset = tokenOffset;
      const words = original.words.slice(offset, offset + count).map((word, localIndex) => ({ ...word,
        phonetic: context.window.britishPhoneticFor(word.text, word.phonetic, original.english, offset + localIndex) || word.phonetic
      }));
      tokenOffset += count;
      const record = {
        ...source, sentenceId: id, english: child.english, chinese: child.chinese,
        parentSentenceId: source.sentenceId, parentEnglish: original.english, tokenOffset: offset,
        segmentOrder: index + 1, segmentCount: 2, contentRevision: plan.revision,
        intent: child.intent, comparison: null,
        parts: child.parts.map(([text, relation, meaning]) => ({ text, relation, meaning })),
        notes: child.notes.map(([title, text]) => ({ title, text })),
        structureNotes: child.notes.map(([title, text]) => ({ title, text })),
        structures: child.structures.map(([text, role, explanation]) => ({ text, role, explanation })),
        words, analysisSource: 'ai', analysisStatus: 'approved', ruleVersion: 'reviewed-sentence-boundaries-1.0.0',
        reviewNote: entry.provenance.modelReviewed ? `豆包依据已有内容调整并独立请求复核；非人工核验。${entry.provenance.reviewNote || ''}` : 'Codex逐条调整并自检；继承原词项，非外部API生成、非逐句人工核验。',
        hints: { memoryNote: child.intent, letterShape: makeLetterShape(child.english), answerNote: child.tip }
      };
      delete record.context;
      const errors = validateUnderstanding(record);
      if (!child.notes.length || !child.tip?.trim() || !/[\u3400-\u9fff]/u.test(child.tip)) errors.push('Missing authored teaching');
      for (const value of [child.chinese, child.intent, ...record.parts.flatMap(part => [part.relation, part.meaning]), ...record.notes.map(note => note.text)]) if (!/[\u3400-\u9fff]/u.test(value || '')) errors.push('Chinese teaching explanation required');
      if (errors.length) throw Error(`${id}: ${errors.join('; ')}`);
      childTips.push({ courseId: record.courseId, lessonId: record.lessonId, sentenceId: id, english: record.english,
        text: child.tip, author: entry.provenance.author, ...(entry.provenance.modelReviewed ? {} : { editorialAuthor: 'Codex' }), ruleVersion: TEACHER_TIP_VERSION,
        revision: plan.revision, sourceDigest: teacherTipSourceDigest([record]),
        reviewStatus: entry.provenance.modelReviewed ? 'model-reviewed-awaiting-user-review' : 'authored-and-self-reviewed-awaiting-user-review', reviewNote: record.reviewNote,
        accuracyReview: { version: 'nce2-expression-accuracy-1.0.0', model: entry.provenance.author,
          method: entry.provenance.modelReviewed ? 'separate-model-request-not-human-verification' : 'codex-editorial-self-review-not-human-verification', note: entry.provenance.reviewNote || '拆分后逐条复查中文、表达意图与迁移价值，非人工核验。' }
      });
      return record;
    });
    if (tokenOffset !== original.words.length) throw Error(`Token inheritance mismatch: ${source.sentenceId}`);
    replacements.set(source.sentenceId, children);
    runtimeParents.push({ courseId: source.courseId, lessonId: source.lessonId, parentSentenceId: source.sentenceId, parentEnglish: source.english,
      children: children.map(record => ({ id: record.sentenceId, english: record.english, chinese: record.chinese,
        parentSentenceId: record.parentSentenceId, parentEnglish: record.parentEnglish, tokenOffset: record.tokenOffset,
        segmentOrder: record.segmentOrder, segmentCount: record.segmentCount, contentRevision: plan.revision,
        hints: record.hints, analysis: { indexBase: 0,
          tokens: record.words.map(word => ({ text: word.text, displayText: word.text, punctuation: '', phonetic: word.phonetic, translation: word.meaning, posLabel: word.pos })),
          groups: [{ id: `${record.sentenceId}-root`, type: 'independent_element', label: '练习单元', startToken: 0, endToken: record.words.length - 1, parentGroupId: null }]
        }
      }))
    });
  }
  const lessonOrders = new Map();
  const records = sources.flatMap(source => replacements.get(source.sentenceId) || [byId.get(source.sentenceId)]).map(record => {
    if (!record) throw Error('Missing original analysis');
    const key = `${record.courseId}:${record.lessonId}`;
    const order = (lessonOrders.get(key) || 0) + 1;
    lessonOrders.set(key, order);
    return { ...record, sentenceOrder: order };
  });
  const effectiveSources = records.map(record => ({ courseId: record.courseId, lessonId: record.lessonId, sentenceId: record.sentenceId,
    sentenceOrder: record.sentenceOrder, english: record.english, chinese: record.chinese,
    lesson: sourceById.get(record.parentSentenceId || record.sentenceId).lesson,
    ...(record.parentSentenceId ? { parentSentenceId: record.parentSentenceId, parentEnglish: record.parentEnglish, tokenOffset: record.tokenOffset } : {})
  }));
  const affectedLessons = new Set(runtimeParents.map(parent => `${parent.courseId}:${parent.lessonId}`));
  const identities = Object.fromEntries([...Map.groupBy(records.filter(record => affectedLessons.has(`${record.courseId}:${record.lessonId}`)), record => `${record.courseId}:${record.lessonId}`)]
    .map(([key, entries]) => [key, entries.map(record => ({ id: record.sentenceId, english: record.english }))]));
  return { revision: plan.revision, records, sources: effectiveSources,
    teacherTips: { ...teacherTips, revision: plan.revision, records: [...teacherTips.records.filter(tip => !replacements.has(tip.sentenceId)), ...childTips] },
    practiceSplits: { revision: plan.revision, parents: runtimeParents, identities },
    complete: replacements.size === plan.parents.length
  };
}

export async function loadPublishedUnderstanding(options) {
  const source = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
  const pilot = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8'));
  const records = await Promise.all(source.records.map(async entry => pilot.records.find(record => record.sentenceId === entry.sentenceId)
    || JSON.parse(await readFile(`content/understanding-records/${entry.sentenceId}.json`, 'utf8'))));
  const tips = await loadTeacherTips(source.records, { requireComplete: true });
  return applySentenceSplits(source.records, records, tips, options);
}
