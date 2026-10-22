'use strict';
/* store-catalog.js : app.js ar extra.js er por load hoy (index.html er shesh e). */
(() => {
  const css = document.createElement('style');
  css.textContent =
    '#subcats{max-width:1280px;margin:auto;padding:0 14px 10px;display:flex;flex-direction:column;gap:6px}' +
    '#subcats .sr{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}#subcats .sr::-webkit-scrollbar{display:none}' +
    '#subcats a{padding:5px 14px;border-radius:99px;font-size:13px;font-weight:600;white-space:nowrap;background:var(--surface2);border:1px solid var(--border);transition:.2s}' +
    '#subcats a:hover{border-color:var(--primary)}#subcats a.on{background:var(--primary);color:#fff;border-color:transparent}' +
    'body.co #subcats,body.pdp #subcats{display:none}';
  document.head.appendChild(css);

  let tree = [];
  const pathTo = (nodes, id, acc = []) => {
    for (const n of nodes) {
      if (n.id === id) return [...acc, n];
      const r = pathTo(n.children, id, [...acc, n]); if (r) return r;
    }
    return null;
  };
  const curPath = () => {
    const { parts, q } = Q(); if (parts[0] !== 'shop') return null;
    const id = +q.get('cat') || 0, name = q.get('category') || '';
    if (id) return pathTo(tree, id);
    if (name) { const m = tree.find(n => n.name === name); return m ? [m] : null; }
    return null;
  };
  const link = n => n.depth === 1 ? '#/shop?category=' + encodeURIComponent(n.name) : '#/shop?cat=' + n.id;

  function sub() {
    let el = document.getElementById('subcats');
    const p = curPath();
    if (!p) { if (el) el.remove(); return; }
    const main = p[0], activeSub = p[1] || null, activeChild = p[2] || null;
    const rows = [];
    if (main.children.length) {
      rows.push([{ ...main, depth: 1, label: 'All ' + main.name, on: false }, ...main.children.map(c => ({ ...c, depth: 2, label: c.name, on: !!activeSub && !activeChild && c.id === activeSub.id }))]);
    }
    if (activeSub && activeSub.children.length) {
      rows.push([{ ...activeSub, depth: 2, label: 'All ' + activeSub.name, on: false }, ...activeSub.children.map(c => ({ ...c, depth: 3, label: c.name, on: !!activeChild && c.id === activeChild.id }))]);
    }
    if (!rows.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('nav'); el.id = 'subcats'; el.setAttribute('aria-label', 'Subcategories'); document.getElementById('cats').insertAdjacentElement('afterend', el); }
    el.innerHTML = rows.map(r => '<div class="sr">' + r.map(n => '<a href="' + esc(link(n)) + '" class="' + (n.on ? 'on' : '') + '">' + esc(n.label) + '</a>').join('') + '</div>').join('');
  }

  // crumb: "All products" er bodole category path
  function fix() {
    const p = curPath(), c = document.querySelector('.crumb span');
    if (p && c && c.textContent === 'All products') c.textContent = p.map(x => x.name).join(' / ');
    // homepage: "show on homepage" off thaka category lukao
    const cards = document.querySelectorAll('.cats .cat3d');
    if (cards.length) {
      let shown = 0;
      cards.forEach(a => {
        const m = /category=([^&]*)/.exec(a.getAttribute('href') || ''), name = m ? decodeURIComponent(m[1]) : '';
        const meta = cats.find(x => x.category === name), off = !!meta && meta.home === false;
        a.hidden = off; if (!off) shown++;
      });
      const s = cards[0].closest('.sec'); if (s) s.hidden = !shown;
    }
  }

  // nav menu: "show in menu" off thaka category bad
  const origPaint = paintCats;
  paintCats = function () {
    const all = cats; cats = all.filter(c => c.menu !== false);
    try { origPaint(); } finally { cats = all; }
  };
  if (cats.length) paintCats();

  fetch('/api/categories/tree').then(r => r.json()).then(t => { tree = t; sub(); fix(); }).catch(() => { });
  addEventListener('hashchange', () => { sub(); fix(); });
  new MutationObserver(fix).observe(document.getElementById('app'), { childList: true, subtree: true });
})();
