#!/usr/bin/env python3
"""בונה את גרסת הדמו (demo/) מהקבצים החיים - לבקשת סרגיי (2026-10-18):
"גרסת דמו עם נתונים אמיתיים, אך ללא סיסמאות כלל".
- מסד נתונים נפרד: constraints-app-demo (wcbnkrtxdzfygyyanasx) - שינויים בדמו לא נוגעים במערכת האמיתית.
- כניסה לפי שם בלבד (window.CST_DEMO -> portal.js), בלי חובת התראות, בלי service worker.
- מפתחות ה-localStorage בדמו הם cstdemo_ כדי לא להתנגש בכניסה למערכת האמיתית באותו דפדפן.
- (2026-10-18) הקוד של הדמו מוגן ולא נשמר בריפו: הפלט נבנה ל-dist-demo/ (ב-.gitignore) - index.html יחיד,
  מכווץ ומעורבל (tools/demo_protect.mjs) + אייקונים - ומועלה ל-Netlify בכתובת נפרדת שלא מובילה ל-GitHub.
הרצה: python3 tools/build_demo.py  (מתיקיית הריפו)
"""
import os, re, shutil, subprocess, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_URL = "https://hcejwcxsqhpiufaakalj.supabase.co"
DEMO_URL = "https://wcbnkrtxdzfygyyanasx.supabase.co"
DEMO_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjYm5rcnR4ZHpmeWd5eWFuYXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDM3NTUsImV4cCI6MjEwNjE3OTc1NX0.XIYTF7r5CD5ItBHleP_9wtvXLfIn3LvbKmlaw3_bF7A"
BANNER = ('<div style="position:sticky;top:0;z-index:9999;background:#fff3cd;color:#7a5200;border-bottom:1px solid #f0d58a;'
          'padding:8px 12px;text-align:center;font-weight:700;font-size:14px;">🧪 גרסת דמו — נתונים אמיתיים, כניסה בלי קודים. '
          'מה שעושים כאן לא משפיע על המערכת האמיתית.</div>')

def must_sub(pattern, repl, s, count=1, flags=0):
    new, n = re.subn(pattern, repl, s, count=count, flags=flags)
    if n == 0: raise SystemExit("pattern not found: " + pattern)
    return new

def build():
    idx = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    por = open(os.path.join(ROOT, "portal.js"), encoding="utf-8").read()
    idx = must_sub(r'const SUPABASE_URL = "[^"]+";', f'const SUPABASE_URL = "{DEMO_URL}";', idx)
    idx = must_sub(r'const SUPABASE_ANON_KEY = "[^"]+";', f'const SUPABASE_ANON_KEY = "{DEMO_KEY}";', idx)
    if LIVE_URL in idx: raise SystemExit("live URL still present")
    idx = must_sub(r'<script>if\("serviceWorker" in navigator\).*?</script>\n', '', idx, flags=re.S)
    idx = must_sub(r'<link rel="manifest" href="manifest.webmanifest">\n', '', idx)
    idx = must_sub(r'<title>', '<title>דמו — ', idx)
    idx = must_sub(r'<body>', '<body>\n' + BANNER, idx)
    idx = must_sub(r'<script src="portal\.js\?v=(\d+)"></script>', r'<script>window.CST_DEMO = true;</script>\n<script src="portal.js?v=\1"></script>', idx)
    idx = idx.replace('"cst_', '"cstdemo_')
    por = por.replace('"cst_', '"cstdemo_')
    if '"cst_' in idx or '"cst_' in por: raise SystemExit("cst_ keys left")
    out = os.path.join(ROOT, "dist-demo")
    shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, "index.html"), "w", encoding="utf-8").write(idx)
        open(os.path.join(tmp, "portal.js"), "w", encoding="utf-8").write(por)
        subprocess.run(["node", os.path.join(ROOT, "tools", "demo_protect.mjs"), tmp, os.path.join(out, "index.html")], check=True)
    for f in ("icon-192.png", "apple-touch-icon.png"):
        shutil.copy(os.path.join(ROOT, f), os.path.join(out, f))
    open(os.path.join(out, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
    open(os.path.join(out, "_headers"), "w").write("/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Cache-Control: no-cache\n")
    print("dist-demo/ built")

if __name__ == "__main__":
    build()
