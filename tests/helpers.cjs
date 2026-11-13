const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');

async function startServer(port, cwd = ROOT) {
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd,
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url, stop: () => proc.kill() };
}

// 아이폰 크기 화면으로 앱을 연다.
async function openApp(url, { colorScheme = 'light' } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], colorScheme });
  const page = await context.newPage();
  await page.goto(url);
  return { browser, context, page };
}

module.exports = { startServer, openApp };
