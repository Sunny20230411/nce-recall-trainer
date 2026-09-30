import { copyFile, cp, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ['scripts/build-understanding.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build-british-phonetics.mjs'], { stdio: 'inherit' });

await mkdir("dist", { recursive: true });
await copyFile("index.html", "dist/index.html");
await copyFile("ai-chat.js", "dist/ai-chat.js");
await copyFile("stream-events.js", "dist/stream-events.js");
await copyFile("tutor-markdown.js", "dist/tutor-markdown.js");
for (const file of ["understanding-content.js", "understanding-view.js", "understanding-view.css"]) await copyFile(file, `dist/${file}`);
await cp("assets/vendor/marked", "dist/assets/vendor/marked", { recursive: true });
await cp("assets/understanding", "dist/assets/understanding", { recursive: true });
await copyFile('assets/british-english.js', 'dist/assets/british-english.js');
await copyFile('assets/british-phonetics-data.js', 'dist/assets/british-phonetics-data.js');
await copyFile("ai-chat.css", "dist/ai-chat.css");
await copyFile("nce1-zh-supplement.js", "dist/nce1-zh-supplement.js");
await copyFile("nce1-analysis.js", "dist/nce1-analysis.js");
await copyFile("nce2-content.js", "dist/nce2-content.js");
await mkdir("dist/assets/ui/home", { recursive: true });
await cp("assets/ui/home/slices", "dist/assets/ui/home/slices", { recursive: true });

console.log("Built static site to dist/");
