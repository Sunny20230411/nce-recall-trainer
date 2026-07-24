import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright-core";
const { chromium } = await import(playwrightModule);
const root = path.resolve(import.meta.dirname, "..");
const reportDir = path.join(root, "reports");
await mkdir(reportDir, { recursive: true });
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));

const browser = await chromium.launch({
  headless: true,
  executablePath
});
const page = await browser.newPage({ viewport: { width: 2048, height: 1152 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
await page.evaluate(async () => {
  localStorage.setItem("nce_theme", "light");
  await Promise.all(Array.from(document.images, (image) => (
    image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })
  )));
});
await page.reload({ waitUntil: "load" });

const desktop = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".home-course-card"));
  const clickableCards = Array.from(document.querySelectorAll("button.home-course-card"));
  const cardRects = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return {
    bodyClass: document.body.className,
    theme: document.body.dataset.theme,
    cards: cards.length,
    clickableCards: clickableCards.length,
    lockedCards: document.querySelectorAll(".home-course-card.locked").length,
    lessonCounts: [
      document.querySelector("#nce1LessonCount")?.textContent,
      document.querySelector("#nce2LessonCount")?.textContent
    ],
    sentenceCounts: [
      document.querySelector("#nce1SentenceCount")?.textContent,
      document.querySelector("#nce2SentenceCount")?.textContent
    ],
    cardRects,
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth
  };
});

assert.equal(errors.length, 0, errors.join("\n"));
assert.match(desktop.bodyClass, /home-active/);
assert.equal(desktop.theme, "light");
assert.equal(desktop.cards, 4);
assert.equal(desktop.clickableCards, 2);
assert.equal(desktop.lockedCards, 2);
assert.deepEqual(desktop.lessonCounts, ["72", "96"]);
assert.ok(desktop.sentenceCounts.every((count) => Number(count) > 0));
assert.equal(desktop.scrollWidth, desktop.viewport.width);
assert.ok(desktop.cardRects.every((rect) => rect.width > 400 && rect.height >= 450));
assert.ok(desktop.cardRects.every((rect) => Math.abs(rect.y - desktop.cardRects[0].y) < 1));

await page.screenshot({
  path: path.join(reportDir, "home-redesign-desktop-light.png"),
  fullPage: true
});

await page.setViewportSize({ width: 1647, height: 794 });
const compactDesktop = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".home-course-card"));
  const rects = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      ratio: rect.width / rect.height
    };
  });
  return {
    rects,
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
assert.equal(compactDesktop.scrollWidth, compactDesktop.viewportWidth);
assert.equal(compactDesktop.rects.length, 4);
assert.ok(compactDesktop.rects.every((rect) => Math.abs(rect.ratio - (904 / 850)) < 0.02));
assert.ok(compactDesktop.rects.every((rect) => rect.height < 400));
await page.screenshot({
  path: path.join(reportDir, "home-redesign-desktop-compact.png"),
  fullPage: true
});

await page.setViewportSize({ width: 2048, height: 1152 });
await page.click("#themeToggleBtn");
assert.equal(await page.evaluate(() => document.body.dataset.theme), "dark");
await page.screenshot({
  path: path.join(reportDir, "home-redesign-desktop-dark.png"),
  fullPage: true
});

await page.click("#openNce1Btn");
assert.equal(await page.evaluate(() => document.querySelector("#listView")?.classList.contains("active")), true);
assert.equal(await page.evaluate(() => document.body.classList.contains("home-active")), false);
await page.click("#homeBtn");
assert.equal(await page.evaluate(() => document.querySelector("#homeView")?.classList.contains("active")), true);
assert.equal(await page.evaluate(() => document.body.classList.contains("home-active")), true);
await page.click("#openNce2Btn");
assert.match(await page.textContent("#courseListTitle"), /第二册/);
await page.click("#homeBtn");

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => localStorage.setItem("nce_theme", "light"));
await page.reload({ waitUntil: "load" });
const mobile = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(".home-course-card"));
  const rects = cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  return {
    rects,
    viewportWidth: innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
assert.equal(mobile.scrollWidth, mobile.viewportWidth);
assert.ok(mobile.rects.every((rect) => rect.width > 340));
assert.ok(mobile.rects.slice(1).every((rect, index) => rect.y > mobile.rects[index].y));
await page.screenshot({
  path: path.join(reportDir, "home-redesign-mobile-light.png"),
  fullPage: true
});

await browser.close();
console.log("Home redesign browser test passed.");
