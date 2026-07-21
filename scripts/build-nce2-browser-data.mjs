import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "content/nce2.enriched.v1.json";
const outputPath = process.argv[3] || "nce2-content.js";

const contentPackage = JSON.parse(await readFile(inputPath, "utf8"));
const browserCourse = {
  courseId: contentPackage.course.courseId,
  title: contentPackage.course.title,
  shortTitle: "新概念英语第二册",
  description: "短篇叙事与语法进阶，按课文顺序逐句进行中译英默写训练。",
  revision: contentPackage.course.revision,
  lessons: contentPackage.lessons.map((lesson, catalogIndex) => ({
    id: lesson.lessonId,
    lessonNo: lesson.lessonNo,
    catalogOrder: catalogIndex + 1,
    title: `Lesson ${lesson.lessonNo} ${lesson.title}`,
    titleZh: lesson.titleZh || "",
    intro: "本课英文原文、中文提示和静态解析已导入，可以开始中译英默写训练。",
    sentences: lesson.sentences.map((sentence) => ({
      id: sentence.sentenceId,
      english: sentence.english,
      chinese: sentence.chinese,
      acceptedAnswers: sentence.acceptedAnswers || [],
      hints: sentence.hints || {},
      analysis: {
        source: sentence.analysisSource,
        status: sentence.analysisStatus,
        ruleVersion: sentence.analysisRuleVersion,
        tokens: (sentence.tokens || []).map((token) => ({
          order: token.tokenIndex,
          displayText: token.displayText,
          punctuation: token.punctuation || "",
          phonetic: token.phonetic || "",
          translation: token.contextMeaning || "",
          posFamily: token.posCode || "particle",
          posLabel: token.posLabel || "单词"
        })),
        groups: (sentence.groups || []).map((group) => ({
          id: group.groupId,
          type: group.type,
          label: group.label || "",
          startToken: group.startToken,
          endToken: group.endToken,
          parentGroupId: group.parentGroupId || null
        }))
      }
    }))
  }))
};

await writeFile(outputPath, `window.NCE2_COURSE_DATA = ${JSON.stringify(browserCourse)};\n`, "utf8");
const sentenceCount = browserCourse.lessons.reduce((sum, lesson) => sum + lesson.sentences.length, 0);
console.log(`Built ${outputPath}: ${browserCourse.lessons.length} lessons, ${sentenceCount} sentences.`);
