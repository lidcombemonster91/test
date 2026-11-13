const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, openApp } = require('./helpers.cjs');

let server;
before(async () => {
  server = await startServer(8731);
});
after(() => server.stop());

test('앱을 열면 메모 입력칸과 저장 버튼이 한국어로 보인다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await page.getByPlaceholder('무슨 생각이 나세요?').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: '저장' }).waitFor({ timeout: 3000 });
  } finally {
    await browser.close();
  }
});

test('메모를 저장하면 목록 맨 위에 보이고, 새로고침해도 남아 있다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    const input = page.getByPlaceholder('무슨 생각이 나세요?');
    await input.fill('첫 번째 메모');
    await page.getByRole('button', { name: '저장' }).click();
    await input.fill('두 번째 메모');
    await page.getByRole('button', { name: '저장' }).click();

    const items = page.getByTestId('item');
    await items.first().waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['두 번째 메모', '첫 번째 메모']);

    await page.reload();
    await items.first().waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['두 번째 메모', '첫 번째 메모']);

    // 저장 후 입력칸은 비워진다
    assert.strictEqual(await input.inputValue(), '');
  } finally {
    await browser.close();
  }
});

test('빈 메모는 저장되지 않는다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await page.getByPlaceholder('무슨 생각이 나세요?').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: '저장' }).click();
    assert.strictEqual(await page.getByTestId('item').count(), 0);
  } finally {
    await browser.close();
  }
});

test('저장 버튼은 손가락으로 누르기 쉬운 크기(44px 이상)다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    const box = await page.getByRole('button', { name: '저장' }).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `크기: ${JSON.stringify(box)}`);
  } finally {
    await browser.close();
  }
});

test('어두운 모드에서는 배경이 어둡고 글자가 밝다', async () => {
  const { browser, page } = await openApp(server.url, { colorScheme: 'dark' });
  try {
    await page.getByPlaceholder('무슨 생각이 나세요?').waitFor({ timeout: 3000 });
    const [bg, fg] = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+/g).map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return [lum(s.backgroundColor), lum(s.color)];
    });
    assert.ok(bg < 80 && fg > 150, `배경 밝기 ${bg}, 글자 밝기 ${fg}`);
  } finally {
    await browser.close();
  }
});
