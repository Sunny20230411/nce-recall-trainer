import { readFile, writeFile } from "node:fs/promises";

const packagePath = process.argv[2] || "content/nce2.enriched.v1.json";
const overridesPath = process.argv[3] || "content/nce2.translation-overrides.v1.json";
const contentPackage = JSON.parse(await readFile(packagePath, "utf8"));
const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
const sentences = new Map(
  contentPackage.lessons.flatMap((lesson) => lesson.sentences).map((sentence) => [sentence.sentenceId, sentence])
);

for (const [sentenceId, chinese] of Object.entries(overrides)) {
  const sentence = sentences.get(sentenceId);
  if (!sentence) throw new Error(`Unknown sentence override: ${sentenceId}`);
  sentence.chinese = chinese;
  sentence.translationStatus = "reviewed";
  sentence.reviewNote = sentence.reviewNote
    ? "中文提示已复核；句子结构仍建议人工抽查"
    : "中文提示已复核";
  if (sentence.hints) sentence.hints.answerNote = `记住它：这句在课文里表达“${chinese.replace(/[。！？]$/u, "")}”。`;
}

contentPackage.course.updatedAt = new Date().toISOString();
await writeFile(packagePath, `${JSON.stringify(contentPackage, null, 2)}\n`, "utf8");
console.log(`Applied ${Object.keys(overrides).length} reviewed Chinese overrides.`);
