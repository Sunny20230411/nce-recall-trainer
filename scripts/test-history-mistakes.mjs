import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const reportDir = path.join(root, "reports");
await mkdir(reportDir, { recursive: true });
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("nce_theme", "light");
  localStorage.setItem("nce_learning_records_v1", JSON.stringify({
    "lesson-1": {
      lessonId: "lesson-1",
      lessonTitle: "Lesson 1 Excuse me!",
      startedRuns: 2,
      completedRuns: 1,
      progress: 100,
      completed: true,
      lastAccuracy: 75,
      bestAccuracy: 75,
      aggregateCorrect: 6,
      aggregateQuestions: 8,
      lastDuration: 30,
      lastPosition: 0,
      lastStudiedAt: "2026-07-25T08:00:00.000Z",
      wrongSentences: [{
        english: "Excuse me!",
        chinese: "打扰一下！",
        wrongCount: 2,
        lastInput: "Excuse",
        lastWrongAt: "2026-07-25T08:00:00.000Z"
      }],
      newWords: []
    }
  }));
});
await page.reload({ waitUntil: "load" });

await page.click("#openNce1Btn");
await page.click('.lesson-card[data-id="lesson-1"]');

assert.equal(await page.textContent("#historyMistakesBtn"), "错句 1");
assert.equal(await page.isEnabled("#historyMistakesBtn"), true);
await page.click("#historyMistakesBtn");
assert.equal(await page.isVisible("#historyMistakesPanel"), true);
assert.equal(await page.locator(".history-mistake-item").count(), 1);
assert.match(await page.textContent("#historyMistakeList"), /Excuse me!/);
assert.match(await page.textContent("#historyMistakeList"), /错 2 次/);
await page.screenshot({
  path: path.join(reportDir, "history-mistakes-preview.png"),
  fullPage: true
});

await page.click("#reviewHistoryMistakesBtn");
assert.equal(await page.isVisible("#practiceView"), true);
assert.equal(await page.textContent("#practiceLesson"), "复习本次错题");
assert.equal(await page.textContent("#practiceCount"), "1 / 1");

await page.keyboard.press("Alt");
assert.equal(await page.locator("#answerReveal").evaluate((element) => element.classList.contains("hidden")), false);
assert.match(await page.textContent("#answerBtn"), /Alt \/ Option.*隐藏答案/);
await page.keyboard.press("Alt");
assert.equal(await page.locator("#answerReveal").evaluate((element) => element.classList.contains("hidden")), true);
assert.match(await page.textContent("#answerBtn"), /Alt \/ Option.*显示答案/);

const inputs = page.locator(".slot-input");
assert.equal(await inputs.count(), 2);
await inputs.nth(0).fill("Excuse");
await inputs.nth(0).press("Space");
await inputs.nth(1).fill("me");
await inputs.nth(1).press("Space");
await page.waitForFunction(() => document.querySelector("#submitBtn")?.textContent.includes("下一题"));
await page.keyboard.press("Enter");
await page.waitForSelector("#resultView.active");

assert.equal(await page.isVisible("#nextLessonBtn"), true);
assert.match(await page.textContent("#nextLessonBtn"), /Lesson 3/);
await page.screenshot({
  path: path.join(reportDir, "history-mistakes-result.png"),
  fullPage: true
});

const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("nce_learning_records_v1")));
assert.equal(persisted["lesson-1"].completedRuns, 1);
assert.equal(persisted["lesson-1"].wrongSentences.length, 1);

await page.click("#nextLessonBtn");
assert.equal(await page.isVisible("#practiceView"), true);
assert.match(await page.textContent("#practiceLesson"), /Lesson 3/);
assert.equal(errors.length, 0, errors.join("\n"));

await browser.close();
console.log("Historical mistake review browser test passed.");
