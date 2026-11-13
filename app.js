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

  const searchInput = document.getElementById('search');
  let allItems = [];
  let thumbUrls = [];

  // 검색에 쓰이는 글: 항목 종류가 늘어나도 여기만 고치면 된다.
  function searchableText(item) {
    return item.type === 'link' ? `${item.text} ${item.url}` : item.text || '';
  }

  // http/https 주소만 허용한다. (javascript: 같은 위험한 주소는 막는다)
  function normalizeUrl(raw) {
    const value = raw.trim();
    if (!value || /\s/.test(value)) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(withScheme);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function render() {
    const query = searchInput.value.trim().toLowerCase();
    const items = allItems
      .filter((item) => !query || searchableText(item).toLowerCase().includes(query))
      .sort((a, b) => b.createdAt - a.createdAt);
    document.getElementById('empty').hidden = !(query && items.length === 0);
    thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    thumbUrls = [];
    list.replaceChildren(
      ...items.map((item) => {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'item');
        el.dataset.id = item.id;
        el.dataset.type = item.type;
        el.tabIndex = 0;
        if (item.type === 'link') {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = '링크';
          const desc = document.createElement('span');
          desc.textContent = item.text;
          const anchor = document.createElement('a');
          anchor.href = item.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = item.url;
          el.append(badge, desc, anchor);
        } else if (item.type === 'photo') {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = '사진';
          const desc = document.createElement('span');
          desc.textContent = item.text;
          const img = document.createElement('img');
          const url = URL.createObjectURL(item.blob);
          thumbUrls.push(url);
          img.src = url;
          img.alt = item.text || '저장한 사진';
          el.append(badge, desc, img);
        } else {
          el.textContent = item.text;
        }
        return el;
      })
    );
  }

  async function refresh() {
    const items = await run(db, 'readonly', (store) => store.getAll());
    lastTs = Math.max(lastTs, ...items.map((i) => i.createdAt), 0);
    allItems = items;
    render();
  }

  searchInput.addEventListener('input', render);

  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewer-img');
  let viewerUrl = null;

  function openViewer(item) {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(item.blob);
    viewerImg.src = viewerUrl;
    viewerImg.alt = item.text || '저장한 사진';
    document.getElementById('viewer-caption').textContent = item.text;
    viewer.hidden = false;
  }

  document.getElementById('viewer-close').addEventListener('click', () => {
    viewer.hidden = true;
    viewerImg.removeAttribute('src');
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = null;
  });

  list.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-testid="item"]');
    if (!el) return;
    if (event.target.closest('a')) return;
    const item = await run(db, 'readonly', (store) => store.get(el.dataset.id));
    if (item && item.type === 'photo') {
      openViewer(item);
      return;
    }
    if (!item || item.type !== 'memo') return;
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

  const linkForm = document.getElementById('link-form');
  linkForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const urlInput = document.getElementById('link-url');
    const descInput = document.getElementById('link-desc');
    const url = normalizeUrl(urlInput.value);
    if (!url || !db) return;
    const text = descInput.value.trim();
    urlInput.value = '';
    descInput.value = '';
    lastTs = Math.max(Date.now(), lastTs + 1);
    const item = { id: crypto.randomUUID(), type: 'link', url, text, createdAt: lastTs };
    await run(db, 'readwrite', (store) => store.add(item));
    await refresh();
  });

  const MAX_SIDE = 1600;

  // 큰 사진은 저장이 느려지지 않도록 줄인다. 읽을 수 없는 파일은 원본 그대로 저장한다.
  async function shrinkPhoto(file) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      return blob || file;
    } catch {
      return file;
    }
  }

  const photoForm = document.getElementById('photo-form');
  photoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById('photo-file');
    const descInput = document.getElementById('photo-desc');
    const file = fileInput.files[0];
    if (!file || !db) return;
    const text = descInput.value.trim();
    fileInput.value = '';
    descInput.value = '';
    lastTs = Math.max(Date.now(), lastTs + 1);
    const blob = await shrinkPhoto(file);
    const item = { id: crypto.randomUUID(), type: 'photo', text, blob, createdAt: lastTs };
    await run(db, 'readwrite', (store) => store.add(item));
    await refresh();
  });

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
