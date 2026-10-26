import { writeFile } from 'node:fs/promises';
import { loadPublishedUnderstanding, makeLetterShape } from './sentence-split-content.mjs';

const published = await loadPublishedUnderstanding();
const scanCorrection = process.argv.includes('--scan-correction');
const normalize = value => value.toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const posCode = label => {
  if (/[+＋]/u.test(label)) return null;
  for (const [pattern, code] of [[/代词/u, 'pronoun'], [/名词/u, 'noun'], [/动词/u, 'verb'], [/形容词/u, 'adjective'], [/副词/u, 'adverb'], [/介词/u, 'preposition'], [/连词/u, 'conjunction'], [/冠词|限定词/u, 'determiner'], [/数词/u, 'numeral'], [/感叹词/u, 'interjection'], [/标记|小品词/u, 'particle']]) if (pattern.test(label)) return code;
  return null;
};
const withoutEnd = text => text.replace(/[.!?"'’”]+$/u, '');
for (const courseId of ['nce1', 'nce2']) {
  if (scanCorrection && courseId !== 'nce1') continue;
  const affected = new Set((scanCorrection ? published.practiceCorrections.lessons : published.practiceSplits.parents).filter(parent => parent.courseId === courseId).map(parent => parent.lessonId));
  const groups = Map.groupBy(published.records.filter(record => record.courseId === courseId && affected.has(record.lessonId)), record => record.lessonId);
  const lessons = [...groups].map(([lessonId, records], index) => ({
    lessonId, lessonNo: Number(lessonId.match(/\d+$/)[0]), title: published.sources.find(source => source.lessonId === lessonId && source.courseId === courseId).lesson,
    order: index + 1, sourceText: records.map(record => record.english).join(' '),
    sentences: records.map(record => {
      const completeStructure = record.structures.find(group => withoutEnd(group.text) === withoutEnd(record.english));
      const typeMap = [[/定语从句/u, 'relative_clause'], [/原因从句/u, 'reason_clause'], [/时间从句/u, 'time_clause'], [/条件从句/u, 'condition_clause'], [/宾语从句/u, 'object_clause'], [/独立|短答|省略|感叹|呼语/u, 'independent_element'], [/名词短语/u, 'noun_phrase'], [/介词短语/u, 'prepositional_phrase'], [/并列/u, 'coordinate_clause'], [/主句|完整|陈述句|疑问句|祈使句|主系表/u, 'main_clause']];
      const type = typeMap.find(([pattern]) => pattern.test(completeStructure?.role || ''))?.[1] || 'independent_element';
      const tokens = record.words.map((word, tokenIndex) => {
        const punctuation = word.text.match(/[^\p{L}\p{N}]+$/u)?.[0] || '';
        return { tokenId: word.tokenId || `${record.parentSentenceId || record.sentenceId}-token-${String((record.tokenOffset || 0) + tokenIndex).padStart(3, '0')}`,
          tokenIndex, displayText: punctuation ? word.text.slice(0, -punctuation.length) : word.text,
          normalizedText: normalize(word.text), punctuation, phonetic: word.phonetic,
          posCode: posCode(word.pos), posLabel: word.pos, contextMeaning: word.meaning };
      });
      return { sentenceId: record.sentenceId, order: record.sentenceOrder,
        sourceParagraphOrder: 1, sourceSentenceOrder: record.sentenceOrder,
        english: record.english, chinese: record.chinese, translationStatus: 'approved',
        acceptedAnswers: [], audioUrl: null, analysisSource: record.analysisSource,
        analysisStatus: record.analysisStatus, analysisRuleVersion: record.ruleVersion, reviewNote: record.reviewNote,
        understanding: record, tokens,
        // Detailed authored roles remain in understanding.structures; this root supplies token coverage.
        groups: [{ groupId: `${record.sentenceId}-root`, type, label: completeStructure?.role || '结构见详细解析', startToken: 0, endToken: tokens.length - 1, parentGroupId: null }],
        hints: record.hints || { memoryNote: record.intent, letterShape: makeLetterShape(record.english), answerNote: record.intent }
      };
    })
  }));
  const path = `content/${scanCorrection ? 'scan-correction-update' : 'sentence-split-update'}.${courseId}.enriched.v1.json`;
  await writeFile(path, JSON.stringify({ schemaVersion: '1.0.0', stage: 'enriched', generatorVersion: 'reviewed-sentence-boundaries-1.0.0',
    course: { courseId, title: courseId === 'nce1' ? '新概念英语第一册' : '新概念英语第二册', language: 'en', translationLanguage: 'zh-CN', revision: published.revision,
      sourceName: 'Boundary revision: complete revised lessons only; unchanged lessons omitted', sourceLicense: null }, lessons }, null, 2) + '\n');
  console.log(JSON.stringify({ path, lessons: lessons.length, sentences: lessons.reduce((sum, lesson) => sum + lesson.sentences.length, 0) }));
}
