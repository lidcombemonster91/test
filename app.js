(function () {
  const DB_NAME = 'second-brain';
  const STORE = 'items';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function run(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && result.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  const form = document.getElementById('memo-form');
  const input = document.getElementById('memo-input');
  const list = document.getElementById('list');
  const detail = document.getElementById('detail');
  const detailInput = document.getElementById('detail-input');
  let db;
  let lastTs = 0;
  let openId = null;

  function render(items) {
    items.sort((a, b) => b.createdAt - a.createdAt);
    list.replaceChildren(
      ...items.map((item) => {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'item');
        el.dataset.id = item.id;
        el.tabIndex = 0;
        el.textContent = item.text;
        return el;
      })
    );
  }

  async function refresh() {
    const items = await run(db, 'readonly', (store) => store.getAll());
    lastTs = Math.max(lastTs, ...items.map((i) => i.createdAt), 0);
    render(items);
  }

  list.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-testid="item"]');
    if (!el) return;
    const item = await run(db, 'readonly', (store) => store.get(el.dataset.id));
    if (!item) return;
    openId = item.id;
    detailInput.value = item.text;
    detail.hidden = false;
    detailInput.focus();
  });

  function closeDetail() {
    openId = null;
    detail.hidden = true;
    detailInput.value = '';
  }

  document.getElementById('detail-save').addEventListener('click', async () => {
    const text = detailInput.value.trim();
    if (!openId || !text) return;
    const id = openId;
    const item = await run(db, 'readonly', (store) => store.get(id));
    if (!item) return;
    await run(db, 'readwrite', (store) => store.put({ ...item, text }));
    closeDetail();
    await refresh();
  });

  document.getElementById('detail-delete').addEventListener('click', async () => {
    if (!openId) return;
    if (!window.confirm('이 메모를 삭제할까요? 되돌릴 수 없어요.')) return;
    const id = openId;
    await run(db, 'readwrite', (store) => store.delete(id));
    closeDetail();
    await refresh();
  });

  document.getElementById('detail-close').addEventListener('click', closeDetail);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !db) return;
    // 저장을 기다리는 동안 다음 글을 쓸 수 있도록 입력칸을 바로 비운다.
    input.value = '';
    lastTs = Math.max(Date.now(), lastTs + 1);
    const item = { id: crypto.randomUUID(), type: 'memo', text, createdAt: lastTs };
    await run(db, 'readwrite', (store) => store.add(item));
    await refresh();
  });

  openDb().then((opened) => {
    db = opened;
    return refresh();
  });
})();
