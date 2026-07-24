import { copyFile, cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
await copyFile("nce1-zh-supplement.js", "dist/nce1-zh-supplement.js");
await copyFile("nce1-analysis.js", "dist/nce1-analysis.js");
await copyFile("nce2-content.js", "dist/nce2-content.js");
await mkdir("dist/assets/ui/home", { recursive: true });
await cp("assets/ui/home/slices", "dist/assets/ui/home/slices", { recursive: true });

console.log("Built static site to dist/");
