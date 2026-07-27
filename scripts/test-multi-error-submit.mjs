import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("nce_theme", "light");
});
await page.reload({ waitUntil: "load" });

await page.click("#openNce1Btn");
await page.click('.lesson-card[data-id="lesson-1"]');
await page.click("#startBtn");
for (let index = 0; index < 6; index += 1) {
  await page.click("#nextBtn");
}

assert.match(await page.textContent("#currentChinese"), /感谢/);
assert.equal(await page.locator(".slot-input").count(), 4);

const fillWord = async (index, value, pressSpace = true) => {
  const input = page.locator(`.slot-input[data-index="${index}"]`);
  await input.fill(value);
  if (pressSpace) await input.press("Space");
};

const resetAndStartLessonOne = async () => {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.click("#openNce1Btn");
  await page.click('.lesson-card[data-id="lesson-1"]');
  await page.click("#startBtn");
};

// First validation: the first three words are wrong, while the sentence-final
// word is correct. The last pending correction therefore sits before sentence end.
await fillWord(0, "Thanks");
await fillWord(1, "your");
await fillWord(2, "so");
await fillWord(3, "much");
await page.waitForFunction(() => document.querySelectorAll(".word-slot.wrong").length === 3);

assert.deepEqual(
  await page.locator(".word-slot.wrong .slot-input").evaluateAll((inputs) => inputs.map((input) => Number(input.dataset.index))),
  [0, 1, 2]
);
assert.equal(await page.locator('.slot-input[data-index="0"]').inputValue(), "Thanks");
assert.equal(await page.locator('.slot-input[data-index="1"]').inputValue(), "your");
assert.equal(await page.locator('.slot-input[data-index="2"]').inputValue(), "so");
assert.equal(await page.locator('.slot-input[data-index="3"]').inputValue(), "much");

// Correct the red slots directly. Once the third correction is filled, Space
// must revalidate immediately instead of moving to the retained final word.
const firstWrongInput = page.locator('.slot-input[data-index="0"]');
await firstWrongInput.press("Space");
assert.doesNotMatch(await page.textContent("#submitBtn"), /下一题/);
assert.equal(await firstWrongInput.inputValue(), "Thanks");
await firstWrongInput.press("T");
assert.equal(await firstWrongInput.inputValue(), "T");
await firstWrongInput.fill("Thank");
await firstWrongInput.press("Space");
await fillWord(1, "you");
await fillWord(2, "very");

await page.waitForFunction(() => document.querySelector("#submitBtn")?.textContent.includes("下一题"));
assert.equal(await page.locator(".word-slot.wrong").count(), 0);

// A single non-final error also submits as soon as that red slot is refilled.
await resetAndStartLessonOne();
await fillWord(0, "Sorry");
await fillWord(1, "me");
await page.waitForFunction(() => document.querySelectorAll(".word-slot.wrong").length === 1);
await fillWord(0, "Excuse");
await page.waitForFunction(() => document.querySelector("#submitBtn")?.textContent.includes("下一题"));

// A sentence-final error keeps the established final-slot submission behavior.
await resetAndStartLessonOne();
await fillWord(0, "Excuse");
await fillWord(1, "you");
await page.waitForFunction(() => document.querySelectorAll(".word-slot.wrong").length === 1);
await fillWord(1, "me");
await page.waitForFunction(() => document.querySelector("#submitBtn")?.textContent.includes("下一题"));

assert.equal(errors.length, 0, errors.join("\n"));

await browser.close();
console.log("Multi-error correction submits from the final pending error.");
