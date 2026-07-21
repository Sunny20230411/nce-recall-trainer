import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const inputArg = process.argv[2];
const outputArg = process.argv[3] || "content/nce2.raw.v1.json";

if (!inputArg) {
  throw new Error("Usage: npm run import:nce2 -- <source.txt> [output.json]");
}

const inputPath = path.resolve(rootDir, inputArg);
const outputPath = path.resolve(rootDir, outputArg);
const source = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const headerPattern = /^#{2,4}\s*Lesson\s+(\d+)\s+(.+)$/gm;
const headers = [...source.matchAll(headerPattern)];

if (headers.length !== 96) {
  throw new Error(`Expected 96 lesson headers, found ${headers.length}`);
}

function splitTitle(rawTitle) {
  const cjkIndex = rawTitle.search(/[\u3400-\u9fff]/);
  if (cjkIndex < 0) return { title: rawTitle.trim(), titleZh: null };
  return {
    title: rawTitle.slice(0, cjkIndex).trim(),
    titleZh: rawTitle.slice(cjkIndex).trim()
  };
}

function mergeReportingClauses(parts) {
  const reportingClause = /^(?:[\u2018\u201c'\"])?(?:I|he|she|we|they|[A-Z][a-z]+)\s+(?:said|asked|answered|replied|shouted|exclaimed|added|continued|remarked|explained|thought)\b/;
  return parts.reduce((sentences, part) => {
    const current = part.trim();
    if (!current) return sentences;
    if (sentences.length && reportingClause.test(current) && /[\u2019\u201d'\"]/.test(sentences.at(-1))) {
      sentences[sentences.length - 1] += ` ${current}`;
    } else {
      sentences.push(current);
    }
    return sentences;
  }, []);
}

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

function splitParagraph(paragraph) {
  const parts = [...segmenter.segment(paragraph)].map(({ segment }) => segment.trim()).filter(Boolean);
  return mergeReportingClauses(parts);
}

function parseLesson(match, nextMatch, order) {
  const lessonNo = Number(match[1]);
  if (lessonNo !== order) {
    throw new Error(`Expected Lesson ${order}, found Lesson ${lessonNo}`);
  }

  const { title, titleZh } = splitTitle(match[2].trim());
  const sectionStart = match.index + match[0].length;
  const sectionEnd = nextMatch ? nextMatch.index : source.length;
  const lines = source.slice(sectionStart, sectionEnd).split(/\r?\n/).map((line) => line.trim());
  const contentLines = lines.filter(Boolean);
  const instruction = /^First listen\b/i.test(contentLines[0] || "") ? contentLines.shift() : null;
  const comprehensionQuestion = contentLines.shift() || null;
  const sourceText = contentLines.join("\n\n").trim();

  if (!sourceText) throw new Error(`Lesson ${lessonNo} has no body text`);

  let sentenceOrder = 0;
  const lessonId = `nce-2-lesson-${String(lessonNo).padStart(3, "0")}`;
  const sentences = contentLines.flatMap((paragraph, paragraphIndex) => (
    splitParagraph(paragraph).map((english, sourceSentenceIndex) => {
      sentenceOrder += 1;
      return {
        sentenceId: `${lessonId}-sentence-${String(sentenceOrder).padStart(3, "0")}`,
        order: sentenceOrder,
        sourceParagraphOrder: paragraphIndex + 1,
        sourceSentenceOrder: sourceSentenceIndex + 1,
        english,
        chinese: null,
        translationStatus: "pending",
        acceptedAnswers: [],
        audioUrl: null,
        difficulty: null,
        analysisSource: "pending",
        analysisStatus: "pending",
        analysisRuleVersion: null,
        reviewNote: null,
        tokens: [],
        groups: [],
        hints: { memoryNote: null, letterShape: null, answerNote: null }
      };
    })
  ));

  return {
    lessonId,
    lessonNo,
    title,
    titleZh,
    order,
    instruction,
    comprehensionQuestion,
    sourceText,
    sentences
  };
}

const lessons = headers.map((match, index) => parseLesson(match, headers[index + 1], index + 1));
const sentenceCount = lessons.reduce((total, lesson) => total + lesson.sentences.length, 0);
const contentPackage = {
  schemaVersion: "1.0.0",
  stage: "raw",
  generatorVersion: "nce2-import-1.0.0",
  generatedAt: new Date().toISOString(),
  course: {
    courseId: "nce-2",
    title: "\u65b0\u6982\u5ff5\u82f1\u8bed\u7b2c\u4e8c\u518c",
    description: "\u65b0\u6982\u5ff5\u82f1\u8bed\u7b2c\u4e8c\u518c 96 \u8bfe\u9010\u53e5\u4e2d\u8bd1\u82f1\u9ed8\u5199\u5185\u5bb9\u5305\u3002",
    language: "en",
    translationLanguage: "zh-CN",
    revision: 1,
    sourceName: path.basename(inputPath),
    sourceLicense: null
  },
  lessons
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(contentPackage, null, 2)}\n`, "utf8");
console.log(`Imported ${lessons.length} lessons and ${sentenceCount} practice sentences to ${path.relative(rootDir, outputPath)}`);