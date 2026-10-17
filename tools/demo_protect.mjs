// מגן על קוד הדמו (2026-10-18, לבקשת סרגיי: "שלא תהיה גישה לקוד של הדמו לאדם שאני שולח אליו את הקישור").
// קלט: תיקייה עם index.html + portal.js של הדמו. פלט: index.html יחיד שבו:
//  - כל ה-JS מכווץ (esbuild: בלי הערות, שמות משתנים מקומיים מקוצרים) ומעורבל (XOR + base64) - "צפה במקור" מראה ג'יבריש.
//  - ה-CSS מכווץ, הערות HTML נמחקות.
//  - חסימת קליק ימני, F12, Ctrl+U/S/P, Ctrl+Shift+I/J/C, ומלכודת כלי מפתחים שמרוקנת את הדף.
// הערה: דפדפן חייב לקבל את הקוד כדי להריץ אותו - זו הרתעה וקושי, לא הצפנה מוחלטת.
// שימוש: node tools/demo_protect.mjs <in_dir> <out_file>
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH || "/opt/npm-tools/node_modules/esbuild");

const [inDir, outFile] = process.argv.slice(2);
let html = fs.readFileSync(path.join(inDir, "index.html"), "utf8");
const portal = fs.readFileSync(path.join(inDir, "portal.js"), "utf8");

const key = crypto.randomBytes(48);
const enc = code => {
  const b = Buffer.from(code, "utf8");
  for (let i = 0; i < b.length; i++) b[i] ^= key[(i * 7 + (i >> 3)) % key.length] ^ (i & 0xff);
  return b.toString("base64");
};
const minJs = code => esbuild.transformSync(code, { loader: "js", minify: true, charset: "utf8", legalComments: "none" }).code;
const minCss = code => esbuild.transformSync(code, { loader: "css", minify: true, charset: "utf8" }).code;

// מגן + מפענח - הסקריפט הראשון בדף
const guard = minJs(`
(function(){
  var K = ${JSON.stringify(key.toString("base64"))};
  var k = Uint8Array.from(atob(K), function(c){ return c.charCodeAt(0); });
  window.__d = function(s){
    var b = Uint8Array.from(atob(s), function(c){ return c.charCodeAt(0); });
    for (var i = 0; i < b.length; i++) b[i] ^= k[(i * 7 + (i >> 3)) % k.length] ^ (i & 255);
    (0, eval)(new TextDecoder().decode(b));
  };
  function kill(){ try{ document.documentElement.innerHTML = '<body style="font-family:sans-serif;text-align:center;padding:40px;direction:rtl">התצוגה נחסמה.</body>'; }catch(e){} }
  document.addEventListener("contextmenu", function(e){ if(!/INPUT|TEXTAREA/.test((e.target||{}).tagName||"")) e.preventDefault(); }, true);
  document.addEventListener("keydown", function(e){
    var k2 = (e.key||"").toLowerCase(), c = e.ctrlKey || e.metaKey;
    if (e.key === "F12" || (c && e.shiftKey && (k2 === "i" || k2 === "j" || k2 === "c")) || (c && e.altKey && (k2 === "i" || k2 === "j" || k2 === "c")) || (c && (k2 === "u" || k2 === "s" || k2 === "p"))) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  setInterval(function(){ var t = performance.now(); (function(){}).constructor("debugger")(); if (performance.now() - t > 120) kill(); }, 1500);
})();`);

let n = 0;
// portal.js -> מוטמע ומעורבל
html = html.replace(/<script src="portal\.js\?v=\d+"><\/script>/, () => { n++; return `<script>__d("${enc(minJs(portal))}")</script>`; });
if (n !== 1) throw new Error("portal.js tag not found");
// כל סקריפט פנימי -> מכווץ ומעורבל
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, code) => `<script>__d("${enc(minJs(code))}")</script>`);
// CSS
html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => `<style>${minCss(css)}</style>`);
// הערות HTML ורווחים בין תגיות
html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><");
// המגן - ראשון ב-head
html = html.replace(/<head>/, `<head><script>${guard}</script>`);
if (/portal\.js|ScheduleShifts|github/i.test(html.replace(/<script>__d\("[^"]*"\)<\/script>/g, ""))) throw new Error("identifying string left in markup");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log("protected:", outFile, Math.round(html.length / 1024) + "KB");
