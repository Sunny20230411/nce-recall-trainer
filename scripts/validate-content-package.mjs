import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const inputArg = process.argv[2] || "content/course-content-template.v1.json";
const inputPath = path.resolve(process.cwd(), inputArg);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(scriptDir, "../schemas/course-content.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const allowedStructureTypes = new Set(schema.$defs.structureType.enum);
const allowedPosCodes = new Set(schema.$defs.posCode.enum);
const errors = [];
const warnings = [];

function fail(pathLabel, message) {
  errors.push(`${pathLabel}: ${message}`);
}

function warn(pathLabel, message) {
  warnings.push(`${pathLabel}: ${message}`);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function uniqueValues(items, selector, pathLabel) {
  const seen = new Set();
  items.forEach((item, index) => {
    const value = selector(item);
    if (!value) fail(`${pathLabel}[${index}]`, "missing identity value");
    else if (seen.has(value)) fail(`${pathLabel}[${index}]`, `duplicate value ${value}`);
    seen.add(value);
  });
}

function validateGroups(sentence, sentencePath) {
  const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
  const groups = Array.isArray(sentence.groups) ? sentence.groups : [];
  const groupById = new Map(groups.map((group) => [group.groupId, group]));

  uniqueValues(groups, (group) => group.groupId, `${sentencePath}.groups`);
  groups.forEach((group, index) => {
    const groupPath = `${sentencePath}.groups[${index}]`;
    if (!allowedStructureTypes.has(group.type)) fail(groupPath, `unsupported structure type ${group.type}`);
    if (!Number.isInteger(group.startToken) || !Number.isInteger(group.endToken)) {
      fail(groupPath, "token range must use integer indexes");
      return;
    }
    if (group.startToken < 0 || group.endToken < group.startToken || group.endToken >= tokens.length) {
      fail(groupPath, "token range is outside the sentence tokens");
    }
    if (group.parentGroupId) {
      const parent = groupById.get(group.parentGroupId);
      if (!parent) fail(groupPath, `parent group ${group.parentGroupId} does not exist`);
      else if (group.startToken < parent.startToken || group.endToken > parent.endToken) {
        fail(groupPath, "child group must stay inside its parent range");
      }
    }
  });

  const parentIds = new Set([null, ...groups.map((group) => group.groupId)]);
  parentIds.forEach((parentId) => {
    const siblings = groups
      .filter((group) => (group.parentGroupId || null) === parentId)
      .sort((a, b) => a.startToken - b.startToken || a.endToken - b.endToken);
    for (let index = 1; index < siblings.length; index += 1) {
      if (siblings[index].startToken <= siblings[index - 1].endToken) {
        fail(sentencePath, `sibling groups overlap under ${parentId || "root"}`);
      }
    }
  });

  if (tokens.length && groups.length) {
    const covered = new Set();
    groups.forEach((group) => {
      for (let index = group.startToken; index <= group.endToken; index += 1) covered.add(index);
    });
    if (covered.size !== tokens.length) fail(sentencePath, "analysis groups do not cover every token");
  }
}

function validateSentence(sentence, sentencePath, stage) {
  if (!sentence.sentenceId) fail(sentencePath, "sentenceId is required");
  if (!isPositiveInteger(sentence.order)) fail(sentencePath, "order must be a positive integer");
  if (!isPositiveInteger(sentence.sourceParagraphOrder)) fail(sentencePath, "sourceParagraphOrder must be positive");
  if (!isPositiveInteger(sentence.sourceSentenceOrder)) fail(sentencePath, "sourceSentenceOrder must be positive");
  if (!String(sentence.english || "").trim()) fail(sentencePath, "english is required");

  if (stage !== "raw" && !String(sentence.chinese || "").trim()) fail(sentencePath, "chinese is required after raw stage");
  if (stage !== "raw" && !["generated", "reviewed", "approved"].includes(sentence.translationStatus)) {
    fail(sentencePath, "translationStatus must show generated content after raw stage");
  }

  const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
  if (stage !== "raw" && !tokens.length) fail(sentencePath, "tokens are required after raw stage");
  uniqueValues(tokens, (token) => token.tokenId, `${sentencePath}.tokens`);
  tokens.forEach((token, index) => {
    if (token.tokenIndex !== index) fail(`${sentencePath}.tokens[${index}]`, `tokenIndex must be ${index}`);
    if (!String(token.displayText || "").trim()) fail(`${sentencePath}.tokens[${index}]`, "displayText is required");
    if (stage !== "raw" && !String(token.normalizedText || "").trim()) fail(`${sentencePath}.tokens[${index}]`, "normalizedText is required");
    if (stage !== "raw" && !String(token.phonetic || "").trim()) fail(`${sentencePath}.tokens[${index}]`, "phonetic is required");
    if (stage !== "raw" && !allowedPosCodes.has(token.posCode)) fail(`${sentencePath}.tokens[${index}]`, `unsupported posCode ${token.posCode}`);
    if (stage !== "raw" && !String(token.posLabel || "").trim()) fail(`${sentencePath}.tokens[${index}]`, "posLabel is required");
    if (stage !== "raw" && !String(token.contextMeaning || "").trim()) fail(`${sentencePath}.tokens[${index}]`, "contextMeaning is required");
  });

  if (stage !== "raw" && !(sentence.groups || []).length) fail(sentencePath, "analysis groups are required after raw stage");
  validateGroups(sentence, sentencePath);
  if (stage !== "raw" && !["rule", "ai", "human"].includes(sentence.analysisSource)) {
    fail(sentencePath, "analysisSource must identify how analysis was produced");
  }
  if (stage !== "raw" && !["generated", "reviewed", "approved"].includes(sentence.analysisStatus)) {
    fail(sentencePath, "analysisStatus must show generated content after raw stage");
  }
  if (stage !== "raw" && !sentence.analysisRuleVersion) fail(sentencePath, "analysisRuleVersion is required after raw stage");
  if (stage !== "raw") {
    const hints = sentence.hints || {};
    if (!String(hints.memoryNote || "").trim()) fail(sentencePath, "memoryNote hint is required");
    if (!String(hints.letterShape || "").trim()) fail(sentencePath, "letterShape hint is required");
    if (!String(hints.answerNote || "").trim()) fail(sentencePath, "answerNote hint is required");
  }

  if (stage === "approved") {
    if (sentence.translationStatus !== "approved") fail(sentencePath, "approved package requires approved translation");
    if (sentence.analysisStatus !== "approved") fail(sentencePath, "approved package requires approved analysis");
    if (!sentence.analysisRuleVersion) fail(sentencePath, "analysisRuleVersion is required");
  }
  if (sentence.analysisSource === "human" && sentence.analysisStatus === "generated") {
    warn(sentencePath, "human analysis should normally be reviewed or approved");
  }
}

let data;
try {
  data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  console.error(`Cannot read content package: ${error.message}`);
  process.exit(1);
}

if (data.schemaVersion !== "1.0.0") fail("schemaVersion", "expected 1.0.0");
if (!["raw", "enriched", "approved"].includes(data.stage)) fail("stage", "must be raw, enriched, or approved");
if (!data.course?.courseId) fail("course.courseId", "courseId is required");
if (!isPositiveInteger(data.course?.revision)) fail("course.revision", "revision must be positive");

const lessons = Array.isArray(data.lessons) ? data.lessons : [];
if (!lessons.length) fail("lessons", "at least one lesson is required");
uniqueValues(lessons, (lesson) => lesson.lessonId, "lessons");
uniqueValues(lessons, (lesson) => lesson.lessonNo, "lessons.lessonNo");
uniqueValues(lessons, (lesson) => lesson.order, "lessons.order");

const allSentenceIds = [];
lessons.forEach((lesson, lessonIndex) => {
  const lessonPath = `lessons[${lessonIndex}]`;
  if (!isPositiveInteger(lesson.lessonNo)) fail(lessonPath, "lessonNo must be positive");
  if (!isPositiveInteger(lesson.order)) fail(lessonPath, "order must be positive");
  if (!String(lesson.title || "").trim()) fail(lessonPath, "title is required");
  if (!String(lesson.sourceText || "").trim()) fail(lessonPath, "sourceText is required");
  const sentences = Array.isArray(lesson.sentences) ? lesson.sentences : [];
  if (data.stage !== "raw" && !sentences.length) fail(lessonPath, "sentences are required after raw stage");
  uniqueValues(sentences, (sentence) => sentence.order, `${lessonPath}.sentences.order`);
  sentences.forEach((sentence, sentenceIndex) => {
    allSentenceIds.push(sentence.sentenceId);
    validateSentence(sentence, `${lessonPath}.sentences[${sentenceIndex}]`, data.stage);
  });
});

uniqueValues(allSentenceIds.map((id) => ({ id })), (item) => item.id, "allSentences");

warnings.forEach((message) => console.warn(`Warning: ${message}`));
if (errors.length) {
  errors.forEach((message) => console.error(`Error: ${message}`));
  console.error(`Validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Content package is valid: ${inputPath}`);
console.log(`Lessons: ${lessons.length}; sentences: ${allSentenceIds.length}; stage: ${data.stage}`);
