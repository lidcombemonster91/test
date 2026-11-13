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
    await items.nth(1).waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['두 번째 메모', '첫 번째 메모']);

    await page.reload();
    await items.nth(1).waitFor({ timeout: 3000 });
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

// ---- #3 메모 수정·삭제 ----

async function saveMemo(page, text) {
  await page.getByPlaceholder('무슨 생각이 나세요?').fill(text);
  await page.getByRole('button', { name: '저장' }).click();
  await page.getByTestId('item').filter({ hasText: text }).first().waitFor({ timeout: 3000 });
}

test('메모를 누르면 전체 내용이 수정 화면에 보인다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '긴 메모\n두 번째 줄');
    await page.getByTestId('item').first().click();
    const editor = page.getByLabel('메모 수정');
    await editor.waitFor({ timeout: 3000 });
    assert.strictEqual(await editor.inputValue(), '긴 메모\n두 번째 줄');
  } finally {
    await browser.close();
  }
});

test('메모를 고쳐서 저장하면 목록과 새로고침 후에도 바뀐 내용이 보인다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '오타가 있는 메모');
    await page.getByTestId('item').first().click();
    await page.getByLabel('메모 수정').fill('고친 메모');
    await page.getByRole('button', { name: '수정 저장' }).click();

    const items = page.getByTestId('item');
    await items.filter({ hasText: '고친 메모' }).waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['고친 메모']);

    await page.reload();
    await items.first().waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['고친 메모']);
  } finally {
    await browser.close();
  }
});

test('삭제를 누르면 확인창이 뜨고, 취소하면 그대로 남는다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '지울까 말까');
    const messages = [];
    page.once('dialog', async (dialog) => {
      messages.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByTestId('item').first().click();
    await page.getByRole('button', { name: '삭제' }).click();
    await page.waitForTimeout(300);

    assert.strictEqual(messages.length, 1, '확인창이 한 번 떠야 한다');
    assert.ok(messages[0].includes('삭제'), `확인창 문구: ${messages[0]}`);
    assert.deepStrictEqual(await page.getByTestId('item').allInnerTexts(), ['지울까 말까']);
  } finally {
    await browser.close();
  }
});

test('삭제를 확인하면 메모가 사라지고 새로고침 후에도 없다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '남길 메모');
    await saveMemo(page, '지울 메모');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('item').filter({ hasText: '지울 메모' }).click();
    await page.getByRole('button', { name: '삭제' }).click();

    const items = page.getByTestId('item');
    await items.filter({ hasText: '지울 메모' }).waitFor({ state: 'detached', timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['남길 메모']);

    await page.reload();
    await items.first().waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['남길 메모']);
  } finally {
    await browser.close();
  }
});

// ---- #4 검색 ----

test('검색창에 단어를 입력하면 일치하는 항목만 보인다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '사과 먹기');
    await saveMemo(page, '바나나 사기');
    await saveMemo(page, '사과 주스 만들기');

    await page.getByLabel('검색').fill('사과');
    const items = page.getByTestId('item');
    await items.filter({ hasText: '바나나' }).waitFor({ state: 'detached', timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['사과 주스 만들기', '사과 먹기']);
  } finally {
    await browser.close();
  }
});

test('일치하는 항목이 없으면 "결과가 없어요"가 보인다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '사과 먹기');
    const empty = page.getByText('결과가 없어요');
    assert.strictEqual(await empty.isVisible(), false, '검색 전에는 안내가 없어야 한다');

    await page.getByLabel('검색').fill('수박');
    await empty.waitFor({ state: 'visible', timeout: 3000 });
    assert.strictEqual(await page.getByTestId('item').count(), 0);
  } finally {
    await browser.close();
  }
});

test('검색창을 비우면 전체 목록으로 돌아가고 안내도 사라진다', async () => {
  const { browser, page } = await openApp(server.url);
  try {
    await saveMemo(page, '사과 먹기');
    await saveMemo(page, '바나나 사기');
    const search = page.getByLabel('검색');
    const items = page.getByTestId('item');

    await search.fill('수박');
    await page.getByText('결과가 없어요').waitFor({ state: 'visible', timeout: 3000 });

    await search.fill('');
    await items.nth(1).waitFor({ timeout: 3000 });
    assert.deepStrictEqual(await items.allInnerTexts(), ['바나나 사기', '사과 먹기']);
    assert.strictEqual(await page.getByText('결과가 없어요').isVisible(), false);
  } finally {
    await browser.close();
  }
});
