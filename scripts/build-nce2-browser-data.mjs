import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "content/nce2.enriched.v1.json";
const outputPath = process.argv[3] || "nce2-content.js";
const contentPackage = JSON.parse(await readFile(inputPath, "utf8"));
const LONG_SENTENCE_WORDS = 15;
const MIN_SEGMENT_WORDS = 3;

function wordCount(text) {
  return String(text || "").trim().split(/\s+/u).filter(Boolean).length;
}

function commaPieces(text, separatorPattern) {
  const source = String(text || "").trim();
  const pieces = [];
  let start = 0;
  for (const match of source.matchAll(separatorPattern)) {
    const end = match.index + match[0].length;
    pieces.push(source.slice(start, end).trim());
    start = end;
  }
  if (start < source.length) pieces.push(source.slice(start).trim());
  return pieces.filter(Boolean);
}

function alignedCommaSegments(sentence) {
  if (wordCount(sentence.english) < LONG_SENTENCE_WORDS) return null;
  const englishPieces = commaPieces(sentence.english, /[,;]/gu);
  const chinesePieces = commaPieces(sentence.chinese, /[，；]/gu);
  if (englishPieces.length < 2 || englishPieces.length !== chinesePieces.length || englishPieces.length > 6) return null;

  let tokenCursor = 0;
  const groups = englishPieces.map((english, index) => {
    const count = wordCount(english);
    const group = {
      english,
      chinese: chinesePieces[index],
      startToken: tokenCursor,
      endToken: tokenCursor + count - 1
    };
    tokenCursor += count;
    return group;
  });

  for (let index = 0; index < groups.length; index += 1) {
    if (wordCount(groups[index].english) >= MIN_SEGMENT_WORDS) continue;
    if (index < groups.length - 1) {
      groups[index + 1].english = `${groups[index].english} ${groups[index + 1].english}`;
      groups[index + 1].chinese = `${groups[index].chinese}${groups[index + 1].chinese}`;
      groups[index + 1].startToken = groups[index].startToken;
      groups.splice(index, 1);
      index -= 1;
    } else if (index > 0) {
      groups[index - 1].english = `${groups[index - 1].english} ${groups[index].english}`;
      groups[index - 1].chinese = `${groups[index - 1].chinese}${groups[index].chinese}`;
      groups[index - 1].endToken = groups[index].endToken;
      groups.splice(index, 1);
      index -= 1;
    }
  }
  return groups.length > 1 ? groups : null;
}

function letterShape(text) {
  return String(text || "").replace(/[A-Za-z]+/gu, (word) => `${word[0]}${"_".repeat(word.length - 1)}`);
}

function browserSentence(sentence, segment = null, segmentIndex = 0) {
  const startToken = segment?.startToken ?? 0;
  const endToken = segment?.endToken ?? (sentence.tokens || []).length - 1;
  const english = segment?.english || sentence.english;
  const chinese = segment?.chinese || sentence.chinese;
  const segmentSuffix = segment ? `-part-${String(segmentIndex + 1).padStart(2, "0")}` : "";
  const sourceGroups = (sentence.groups || []).filter(
    (group) => group.endToken >= startToken && group.startToken <= endToken
  );
  const groupIds = new Map(sourceGroups.map((group) => [group.groupId, `${group.groupId}${segmentSuffix}`]));

  return {
    id: `${sentence.sentenceId}${segmentSuffix}`,
    parentSentenceId: segment ? sentence.sentenceId : null,
    segmentOrder: segment ? segmentIndex + 1 : null,
    english,
    chinese,
    acceptedAnswers: [english],
    hints: segment
      ? {
          memoryNote: sentence.hints?.memoryNote || "沿着课文画面继续往下想。",
          letterShape: letterShape(english),
          answerNote: `记住它：这部分表达“${chinese.replace(/[。！？]$/u, "")}”。`
        }
      : sentence.hints || {},
    analysis: {
      source: sentence.analysisSource,
      status: sentence.analysisStatus,
      ruleVersion: sentence.analysisRuleVersion,
      tokens: (sentence.tokens || []).slice(startToken, endToken + 1).map((token, order) => ({
        order,
        displayText: token.displayText,
        punctuation: token.punctuation || "",
        phonetic: token.phonetic || "",
        translation: token.contextMeaning || "",
        posFamily: token.posCode || "particle",
        posLabel: token.posLabel || "单词"
      })),
      groups: sourceGroups.map((group) => ({
        id: groupIds.get(group.groupId),
        type: group.type,
        label: group.label || "",
        startToken: Math.max(group.startToken, startToken) - startToken,
        endToken: Math.min(group.endToken, endToken) - startToken,
        parentGroupId: groupIds.get(group.parentGroupId) || null
      }))
    }
  };
}

function practiceSentences(sentence) {
  const segments = alignedCommaSegments(sentence);
  return segments
    ? segments.map((segment, index) => browserSentence(sentence, segment, index))
    : [browserSentence(sentence)];
}

const browserLessons = contentPackage.lessons.map((lesson, catalogIndex) => ({
  id: lesson.lessonId,
  lessonNo: lesson.lessonNo,
  catalogOrder: catalogIndex + 1,
  title: `Lesson ${lesson.lessonNo} ${lesson.title}`,
  titleZh: lesson.titleZh || "",
  intro: "本课英文原文、中文提示和静态解析已导入，可以开始中译英默写训练。",
  sentences: lesson.sentences.flatMap(practiceSentences)
}));

const browserCourse = {
  courseId: contentPackage.course.courseId,
  title: contentPackage.course.title,
  shortTitle: "新概念英语第二册",
  description: "短篇叙事与语法进阶，按课文顺序逐句进行中译英默写训练。",
  revision: contentPackage.course.revision,
  sourceSentenceCount: contentPackage.lessons.reduce((sum, lesson) => sum + lesson.sentences.length, 0),
  practiceSentenceCount: browserLessons.reduce((sum, lesson) => sum + lesson.sentences.length, 0),
  lessons: browserLessons
};

await writeFile(outputPath, `window.NCE2_COURSE_DATA = ${JSON.stringify(browserCourse)};\n`, "utf8");
console.log(
  `Built ${outputPath}: ${browserCourse.lessons.length} lessons, ` +
  `${browserCourse.sourceSentenceCount} source sentences, ${browserCourse.practiceSentenceCount} practice sentences.`
);
