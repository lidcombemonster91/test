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
  let db;
  let lastTs = 0;

  function render(items) {
    items.sort((a, b) => b.createdAt - a.createdAt);
    list.replaceChildren(
      ...items.map((item) => {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'item');
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !db) return;
    lastTs = Math.max(Date.now(), lastTs + 1);
    const item = { id: crypto.randomUUID(), type: 'memo', text, createdAt: lastTs };
    await run(db, 'readwrite', (store) => store.add(item));
    input.value = '';
    await refresh();
  });

  openDb().then((opened) => {
    db = opened;
    return refresh();
  });
})();
