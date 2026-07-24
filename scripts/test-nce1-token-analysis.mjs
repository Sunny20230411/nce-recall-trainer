import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";


const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(playwrightModule);


const root = path.resolve(import.meta.dirname, "..");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
const result = await page.evaluate(() => {
  const target = sentenceAnalysisFor({ english: "Look! There's an ice cream man." });
  const lessonThree = sentenceAnalysisFor({ english: "Here's your umbrella and your coat." });
  const placeholders = Object.values(window.NCE1_SENTENCE_ANALYSIS || {})
    .flatMap((entry) => entry.tokens || [])
    .filter((token) => !token.translation || token.translation.includes("待补") || token.translation.includes("待人工"));
  return {
    target,
    lessonThree,
    placeholders,
    answerCard: renderAnswerCard({ english: "Look! There's an ice cream man." })
  };
});

assert.equal(errors.length, 0, errors.join("\n"));
assert.equal(result.placeholders.length, 0);
assert.deepEqual(result.target.tokens.map((token) => token.translation), ["看", "有/那里是", "一个", "冰淇淋", "奶油/冰淇淋", "人"]);
assert.equal(result.target.tokens[3].phonetic, "/aɪs/");
assert.equal(result.target.tokens[4].phonetic, "/krim/");
assert.ok(result.answerCard.includes("冰淇淋"));
assert.ok(!result.answerCard.includes("待补释义"));
assert.deepEqual(
  result.lessonThree.groups.map(({ type, startToken, endToken }) => ({ type, startToken, endToken })),
  [
    { type: "predicate", startToken: 0, endToken: 0 },
    { type: "subject", startToken: 1, endToken: 5 }
  ]
);
assert.equal(result.lessonThree.tokens.length, 6);

await page.evaluate(() => {
  document.body.innerHTML = `<main style="padding:48px;min-height:100vh;display:grid;place-items:start center"><div>${renderAnswerCard({ english: "Look! There's an ice cream man." })}</div></main>`;
});
await page.screenshot({ path: path.join(root, "reports", "nce1-word-analysis-preview.png"), fullPage: true });
await browser.close();
console.log("NCE1 token analysis browser test passed.");
