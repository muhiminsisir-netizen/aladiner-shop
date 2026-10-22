'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = n => '৳' + Number(n || 0).toLocaleString('en-IN');
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }
};
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const canHover = matchMedia('(hover:hover)').matches;
const dt = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) };
const PAGES = [['about', 'About Us'], ['shipping_policy', 'Shipping Policy'], ['return_policy', 'Return & Refund'], ['privacy', 'Privacy Policy'], ['terms', 'Terms & Conditions']];

let me = null, cfg = {}, cats = [], PC = {}, sliderT = null, routeId = 0;
let cart = store.get('cart', []).filter(x => x && x.id && x.qty > 0);
let wish = store.get('wish', []);

async function api(url, opt = {}) {
  const o = { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (opt.body !== undefined) o.body = JSON.stringify(opt.body);
  let r; try { r = await fetch(url, o) } catch { throw new Error('Network problem. Check your connection and try again.') }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && me) { me = null; paintAcct() } throw new Error(d.error || 'Something went wrong') }
  return d;
}
function toast(msg, type = 'ok', link) {
  const t = document.createElement('div'); t.className = 'toast ' + type;
  t.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${esc(link[0])}">${esc(link[1])}</a>` : ''}`;
  $('#toasts').appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 3200);
}
const saveCart = () => { store.set('cart', cart); const n = cart.reduce((a, b) => a + b.qty, 0); $$('.cc').forEach(e => { e.textContent = n; e.hidden = !n }) };
const saveWish = () => { store.set('wish', wish); $$('.wc').forEach(e => { e.textContent = wish.length; e.hidden = !wish.length }) };
function addCart(id, qty = 1, stock = 99) {
  const c = cart.find(x => x.id == id);
  if (c) c.qty = Math.min(c.qty + qty, stock); else cart.push({ id: +id, qty: Math.min(qty, stock) });
  saveCart();
}
function toggleWish(id) {
  id = +id; const i = wish.indexOf(id);
  i >= 0 ? wish.splice(i, 1) : wish.push(id); saveWish();
  $$(`[data-w="${id}"]`).forEach(b => b.classList.toggle('on', i < 0));
  toast(i < 0 ? 'Added to wishlist' : 'Removed from wishlist', 'ok');
  if (Q().parts[0] === 'wishlist') route();
}

// ---------- helpers ----------
const isNew = p => Date.now() - new Date(String(p.created).replace(' ', 'T') + 'Z') < 7 * 864e5;
const off = p => p.old_price > p.price ? Math.round(100 - p.price / p.old_price * 100) : 0;
const stars = r => `<span class="stars" aria-label="${r} out of 5">${'★'.repeat(Math.round(r))}<i>${'★'.repeat(5 - Math.round(r))}</i></span>`;
const empty = (i, t, p, b = '') => `<div class="empty"><div class="eico">${i}</div><h3>${esc(t)}</h3><p>${esc(p)}</p>${b}</div>`;
const errBox = m => empty('⚠️', 'Something went wrong', m, '<button class="btn" onclick="route()">Try again</button>');
const skel = n => Array.from({ length: n }, () => '<div class="card sk"><div class="media"></div><div class="info"><i></i><i></i><i class="s"></i></div></div>').join('');
function card(p, i = 0) {
  PC[p.id] = p; const o = off(p);
  return `<article class="card tilt" style="--i:${i % 12}">
  <a class="media" href="#/product/${p.id}" aria-label="${esc(p.name)}">${p.image ? `<img loading="lazy" src="${esc(p.image)}" alt="${esc(p.name)}" width="400" height="400">` : '<span class="noimg">🛍️</span>'}
   <span class="badges">${o ? `<b class="bd red">-${o}%</b>` : ''}${isNew(p) ? '<b class="bd">New</b>' : ''}${p.stock > 0 && p.stock <= 5 ? '<b class="bd warn">Low stock</b>' : ''}</span>
   ${p.stock < 1 ? '<span class="soldout">Sold out</span>' : ''}</a>
  <button class="heart ${wish.includes(p.id) ? 'on' : ''}" data-w="${p.id}" aria-label="Toggle wishlist">${ic('heart')}</button>
  <div class="info"><small class="cat">${esc(p.brand || p.category || ' ')}</small>
   <a class="nm" href="#/product/${p.id}">${esc(p.name)}</a>
   ${p.reviews ? `<div class="rt">${stars(p.rating)}<small>${p.rating} (${p.reviews})</small></div>` : ''}
   <div class="pr"><div><b>${tk(p.price)}</b>${p.old_price > p.price ? ` <s>${tk(p.old_price)}</s>` : ''}</div>
   <button class="qadd" data-add="${p.id}" ${p.stock < 1 ? 'disabled' : ''} aria-label="Add to cart">${ic('plus')}</button></div></div></article>`;
}
const Q = () => { const [h, qs] = location.hash.slice(2).split('?'); return { parts: h.split('/'), q: new URLSearchParams(qs || '') } };

// ---------- global UI ----------
const setTheme = t => { document.documentElement.dataset.theme = t; store.set('theme', t); $$('.tg use').forEach(u => u.setAttribute('href', '#i-' + (t === 'dark' ? 'sun' : 'moon'))) };
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
function paintAcct() {
  const h = me ? '#/orders' : '#/login';
  $('#acct').href = h; $('#acct2').href = h; $('#acct').title = me ? me.name : 'Login';
  $('#acct2 span').textContent = me ? me.name.split(' ')[0].slice(0, 8) : 'Account';
}
function paintCfg() {
  document.title = cfg.store_name || 'Shop';
  $$('.sname').forEach(e => e.textContent = cfg.store_name || 'Shop');
  const a = $('#announce');
  if (cfg.announcement && !sessionStorage.getItem('ann')) {
    a.innerHTML = `<span>${esc(cfg.announcement)}</span><button aria-label="Close">${ic('x')}</button>`; a.hidden = false;
    $('button', a).onclick = () => { sessionStorage.setItem('ann', 1); a.hidden = true };
  } else a.hidden = true;
  const wa = String(cfg.whatsapp || '').replace(/\D/g, ''), link = (u, l) => /^https?:\/\//i.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener">${l}</a>` : '';
  $('#foot').innerHTML = `<div class="fw"><div><div class="logo">${esc(cfg.store_name)}</div><p>${esc((cfg.about || '').slice(0, 140))}</p></div>
  <div><h4>Help</h4>${PAGES.map(([k, t]) => `<a href="#/page/${k}">${t}</a>`).join('')}</div>
  <div><h4>Contact</h4>${cfg.phone ? `<a href="tel:${esc(cfg.phone)}">${esc(cfg.phone)}</a>` : ''}${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${link(cfg.facebook, 'Facebook')}${link(cfg.instagram, 'Instagram')}${cfg.address ? `<span>${esc(cfg.address)}</span>` : ''}${cfg.hours ? `<span>${esc(cfg.hours)}</span>` : ''}${!cfg.phone && !wa && !cfg.address ? '<span>Contact details coming soon</span>' : ''}</div>
  <div><h4>Payment</h4><span>Cash on Delivery</span></div></div>
  <div class="copy">© ${new Date().getFullYear()} ${esc(cfg.store_name)}. All rights reserved.</div>`;
}
function paintCats() {
  const cur = Q().q.get('category') || '', onShop = Q().parts[0] === 'shop';
  $('#cats').innerHTML = `<a href="#/shop" class="${onShop && !cur ? 'on' : ''}">All</a>` +
    cats.map(c => `<a href="#/shop?category=${encodeURIComponent(c.category)}" class="${onShop && cur === c.category ? 'on' : ''}">${esc(c.category)}</a>`).join('');
}
$('#logo').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
addEventListener('scroll', () => { $('#hdr').classList.toggle('sc', scrollY > 8); $('#up').hidden = scrollY < 600 }, { passive: true });
$('#up').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.outerHTML = '<span class="noimg">🛍️</span>' }, true);

// search + suggestions
const si = $('#search'), sug = $('#sug'); let sT, sN = 0;
si.addEventListener('input', () => {
  $('#sclear').hidden = !si.value; clearTimeout(sT);
  const v = si.value.trim(); if (v.length < 2) { sug.hidden = true; return }
  sT = setTimeout(async () => {
    const n = ++sN; sug.innerHTML = '<div class="sg-m">Searching…</div>'; sug.hidden = false;
    try {
      const d = await api('/api/products?q=' + encodeURIComponent(v)); if (n !== sN) return;
      sug.innerHTML = d.items.length ? d.items.slice(0, 6).map(p => `<a href="#/product/${p.id}" class="sg">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<span class="noimg">🛍️</span>'}<span>${esc(p.name)}<small>${tk(p.price)}</small></span></a>`).join('') + `<a class="sg-all" href="#/shop?q=${encodeURIComponent(v)}">See all ${d.total} results</a>` : '<div class="sg-m">No products found</div>';
    } catch { if (n === sN) sug.innerHTML = '<div class="sg-m">Search failed. Try again.</div>' }
  }, 250);
});
si.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const v = si.value.trim(); sug.hidden = true; si.blur(); location.hash = '#/shop?q=' + encodeURIComponent(v) }
  if (e.key === 'Escape') sug.hidden = true;
});
$('#sclear').onclick = () => { si.value = ''; $('#sclear').hidden = true; sug.hidden = true; si.focus() };
document.addEventListener('click', e => { if (!e.target.closest('.search')) sug.hidden = true });

// global click: add to cart / wishlist
document.addEventListener('click', e => {
  const a = e.target.closest('[data-add]');
  if (a) {
    e.preventDefault(); const p = PC[a.dataset.add]; if (!p) return;
    const c = cart.find(x => x.id == p.id);
    if (c && c.qty >= p.stock) return toast('Maximum available quantity is already in your cart', 'err');
    addCart(p.id, 1, p.stock); toast('Added to cart', 'ok', ['#/cart', 'View cart']);
    a.classList.add('pop'); setTimeout(() => a.classList.remove('pop'), 400); return;
  }
  const w = e.target.closest('[data-w]'); if (w) { e.preventDefault(); toggleWish(w.dataset.w) }
});
// 3D tilt
if (canHover && !reduce) {
  document.addEventListener('mousemove', e => {
    const c = e.target.closest && e.target.closest('.tilt'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.transform = `perspective(900px) rotateX(${(.5 - y) * 9}deg) rotateY(${(x - .5) * 11}deg) translateY(-4px)`;
    c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest && e.target.closest('.tilt'); if (c && !c.contains(e.relatedTarget)) c.style.transform = '' });
}

// ---------- pages ----------
const rvList = async () => { const ids = store.get('rv', []); if (!ids.length) return []; try { return await api('/api/products/by-ids?ids=' + ids.join(',')) } catch { return [] } };
const sec = (t, items, link) => items.length ? `<section class="sec"><div class="sh"><h2>${t}</h2>${link ? `<a href="${link}">View all →</a>` : ''}</div><div class="grid">${items.map((p, i) => card(p, i)).join('')}</div></section>` : '';

async function home() {
  const t = routeId; app.innerHTML = `<div class="sk-hero"></div><div class="grid">${skel(4)}</div>`;
  const [bn, deals, fresh, rv] = await Promise.all([api('/api/banners'), api('/api/products?deal=1&sort=discount'), api('/api/products?sort=new'), rvList()]);
  if (t !== routeId) return;
  const hero = bn.length ? `<section class="slider" tabindex="0" aria-roledescription="carousel"><div class="track">${bn.map(b => {
    const inner = `${b.image ? `<img src="${esc(b.image)}" alt="${esc(b.title)}">` : ''}<div class="cap">${b.title ? `<b>${esc(b.title)}</b>` : ''}${b.subtitle ? `<span>${esc(b.subtitle)}</span>` : ''}</div>`;
    return b.link ? `<a class="slide" href="${esc(b.link)}">${inner}</a>` : `<div class="slide">${inner}</div>`;
  }).join('')}</div>${bn.length > 1 ? `<button class="arw l" aria-label="Previous">‹</button><button class="arw r" aria-label="Next">›</button><div class="dots">${bn.map((_, i) => `<button aria-label="Slide ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('')}</div>` : ''}</section>`
    : `<section class="hero" id="hero"><div><span class="pill">${esc(cfg.store_name)}</span><h1>Shop smarter.<br><em>Live better.</em></h1><p>Quality products, simple checkout and Cash on Delivery — all in one place.</p><div class="row"><a class="btn" href="#/shop">Shop now ${ic('arrow')}</a><a class="btn ghost" href="#/shop?deal=1">Hot deals</a></div></div>
    <div class="scene"><div class="sin" id="sin"><div class="cube"><div class="f f1">🛍️</div><div class="f f2">🎁</div><div class="f f3">⭐</div><div class="f f4">🚚</div><div class="f f5">💳</div><div class="f f6">❤️</div></div></div><div class="orb o1"></div><div class="orb o2"></div></div></section>`;
  const feats = [['truck', 'Delivery', `Dhaka ${tk(cfg.ship_dhaka)} · Outside ${tk(cfg.ship_outside)}${+cfg.free_ship > 0 ? ` · Free over ${tk(cfg.free_ship)}` : ''}`], ['shield', 'Cash on Delivery', 'Pay when you receive your order'], ['refresh', 'Order tracking', 'Follow your order step by step'], ['headset', 'Support', cfg.phone || 'See footer for contact details']];
  const none = !fresh.total;
  app.innerHTML = hero + `<div class="feats">${feats.map(f => `<div class="ft">${ic(f[0])}<div><b>${f[1]}</b><small>${esc(f[2])}</small></div></div>`).join('')}</div>` +
    (cats.length ? `<section class="sec"><div class="sh"><h2>Shop by category</h2></div><div class="cats">${cats.map((c, i) => `<a class="cat3d tilt" style="--h:${(i * 47 + 230) % 360}" href="#/shop?category=${encodeURIComponent(c.category)}"><span>${esc(c.category.slice(0, 1).toUpperCase())}</span><b>${esc(c.category)}</b><small>${c.n} items</small></a>`).join('')}</div></section>` : '') +
    sec('🔥 Hot deals', deals.items.slice(0, 4), '#/shop?deal=1&sort=discount') +
    sec('✨ New arrivals', fresh.items.slice(0, 8), '#/shop') +
    sec('Recently viewed', rv.slice(0, 4)) +
    (none ? empty('📦', 'No products yet', 'Add products from the admin panel.') : '');
  sliderInit(); heroInit();
}
function heroInit() {
  const h = $('#hero'), s = $('#sin'); if (!h || !s || reduce || !canHover) return;
  h.onmousemove = e => { const r = h.getBoundingClientRect(); s.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 30 + 'deg'); s.style.setProperty('--rx', (.5 - (e.clientY - r.top) / r.height) * 24 + 'deg') };
  h.onmouseleave = () => { s.style.setProperty('--ry', '0deg'); s.style.setProperty('--rx', '0deg') };
}
function sliderInit() {
  const s = $('.slider'); if (!s) return;
  const tr = $('.track', s), n = $$('.slide', s).length; let i = 0;
  const go = k => { i = (k + n) % n; tr.style.transform = `translateX(-${i * 100}%)`; $$('.dots button', s).forEach((d, j) => d.classList.toggle('on', j === i)) };
  const stop = () => clearInterval(sliderT), play = () => { stop(); if (n > 1 && !reduce) sliderT = setInterval(() => go(i + 1), 5000) };
  if (n < 2) return;
  $('.arw.l', s).onclick = e => { e.preventDefault(); go(i - 1); play() }; $('.arw.r', s).onclick = e => { e.preventDefault(); go(i + 1); play() };
  $$('.dots button', s).forEach((d, j) => d.onclick = () => { go(j); play() });
  s.onmouseenter = stop; s.onmouseleave = play; s.onfocus = stop; s.onblur = play;
  s.onkeydown = e => { if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'ArrowRight') go(i + 1) };
  let x0 = null;
  s.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; stop() }, { passive: true });
  s.addEventListener('touchend', e => { if (x0 != null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1) } x0 = null; play() });
  play();
}

async function shop(q) {
  const t = routeId;
  const F = { q: q.get('q') || '', category: q.get('category') || '', sort: q.get('sort') || 'new', min: q.get('min') || '', max: q.get('max') || '', stock: q.get('stock') || '', rating: q.get('rating') || '', deal: q.get('deal') || '' };
  si.value = F.q; $('#sclear').hidden = !F.q;
  const params = (x = {}) => { const p = new URLSearchParams(); Object.entries({ ...F, ...x }).forEach(([k, v]) => { if (v && !(k === 'sort' && v === 'new')) p.set(k, v) }); return p };
  const lnk = x => esc('#/shop?' + params(x));
  const go = x => { location.hash = '#/shop?' + params(x) };
  const chips = [];
  if (F.q) chips.push(['Search: ' + F.q, { q: '' }]); if (F.category) chips.push([F.category, { category: '' }]);
  if (F.min) chips.push(['Min ' + tk(F.min), { min: '' }]); if (F.max) chips.push(['Max ' + tk(F.max), { max: '' }]);
  if (F.stock) chips.push(['In stock', { stock: '' }]); if (F.deal) chips.push(['On sale', { deal: '' }]); if (F.rating) chips.push([F.rating + '★ & up', { rating: '' }]);
  app.innerHTML = `<div class="crumb"><a href="#/">Home</a> / <span>${F.category ? esc(F.category) : F.q ? 'Search' : 'All products'}</span></div>
  <div class="shopw"><div id="ov"></div>
  <aside class="filters" id="flt"><div class="fh"><b>Filters</b><button class="fx" id="fx" aria-label="Close filters">${ic('x')}</button></div>
   <div class="fg"><h4>Category</h4><a class="${!F.category ? 'on' : ''}" href="${lnk({ category: '' })}">All</a>${cats.map(c => `<a class="${F.category === c.category ? 'on' : ''}" href="${lnk({ category: c.category })}">${esc(c.category)} <small>${c.n}</small></a>`).join('')}</div>
   <div class="fg"><h4>Price (৳)</h4><div class="pr2"><input id="fmin" type="number" min="0" placeholder="Min" value="${esc(F.min)}"><input id="fmax" type="number" min="0" placeholder="Max" value="${esc(F.max)}"></div></div>
   <div class="fg"><h4>Rating</h4><select id="frt"><option value="">Any rating</option><option value="4" ${F.rating === '4' ? 'selected' : ''}>4★ & up</option><option value="3" ${F.rating === '3' ? 'selected' : ''}>3★ & up</option></select></div>
   <div class="fg"><label class="ck"><input type="checkbox" id="fst" ${F.stock ? 'checked' : ''}> In stock only</label><label class="ck"><input type="checkbox" id="fdl" ${F.deal ? 'checked' : ''}> On sale</label></div>
   <div class="row"><button class="btn sm" id="fa">Apply</button><a class="btn ghost sm" href="#/shop">Clear all</a></div></aside>
  <div><div class="toolbar"><button class="btn ghost sm" id="fo">${ic('filter')} Filters</button><small id="cnt">Loading…</small><span class="sp"></span>
   <select id="sort" aria-label="Sort products"><option value="new">Newest</option><option value="low">Price: Low to High</option><option value="high">Price: High to Low</option><option value="rating">Top rated</option><option value="discount">Biggest discount</option></select></div>
   ${chips.length ? `<div class="chips">${chips.map(c => `<a class="chip" href="${lnk(c[1])}">${esc(c[0])} ${ic('x')}</a>`).join('')}</div>` : ''}
   <div id="grid" class="grid">${skel(8)}</div><div class="more" id="more" hidden><button class="btn ghost" id="lm">Load more</button></div></div></div>`;
  $('#sort').value = F.sort; $('#sort').onchange = e => go({ sort: e.target.value });
  const openF = o => { $('#flt').classList.toggle('open', o); $('#ov').classList.toggle('open', o) };
  $('#fo').onclick = () => openF(true); $('#fx').onclick = () => openF(false); $('#ov').onclick = () => openF(false);
  $('#fa').onclick = () => { let a = $('#fmin').value, b = $('#fmax').value; if (a && b && +a > +b) [a, b] = [b, a]; go({ min: a, max: b, stock: $('#fst').checked ? '1' : '', deal: $('#fdl').checked ? '1' : '', rating: $('#frt').value }) };
  let page = 1, shown = 0, total = 0;
  const fetchPage = () => { const p = params(); p.set('page', page); return api('/api/products?' + p) };
  const d = await fetchPage(); if (t !== routeId) return;
  total = d.total; shown = d.items.length; $('#cnt').textContent = total + (total === 1 ? ' product' : ' products');
  $('#grid').innerHTML = d.items.length ? d.items.map((p, i) => card(p, i)).join('') : `<div style="grid-column:1/-1">${empty('🔍', 'No products found', 'Try different keywords or clear some filters.', `<a class="btn" href="#/shop">Clear filters</a>${cats.length ? `<div class="row" style="justify-content:center;margin-top:14px">${cats.slice(0, 5).map(c => `<a class="chip" href="#/shop?category=${encodeURIComponent(c.category)}">${esc(c.category)}</a>`).join('')}</div>` : ''}`)}</div>`;
  const more = $('#more'); more.hidden = shown >= total;
  $('#lm').onclick = async () => {
    const b = $('#lm'); b.disabled = true; b.textContent = 'Loading…'; page++;
    try { const x = await fetchPage(); $('#grid').insertAdjacentHTML('beforeend', x.items.map((p, i) => card(p, i)).join('')); shown += x.items.length; more.hidden = shown >= total || !x.items.length } catch (e) { page--; toast(e.message, 'err') }
    b.disabled = false; b.textContent = 'Load more';
  };
}

async function product(id) {
  const t = routeId; app.innerHTML = '<div class="detail"><div class="skb"></div><div class="skb"></div></div>';
  let p; try { p = await api('/api/products/' + encodeURIComponent(id)) } catch (e) {
    if (t !== routeId) return;
    return app.innerHTML = e.message === 'Product not found' ? empty('😕', 'Product not found', 'It may have been removed or is no longer available.', '<a class="btn" href="#/shop">Browse products</a>') : errBox(e.message);
  }
  if (t !== routeId) return;
  PC[p.id] = p;
  const rvIds = store.get('rv', []).filter(x => x !== p.id); store.set('rv', [p.id, ...rvIds].slice(0, 12));
  const others = rvList(); const g = p.gallery, o = off(p), n = g.length; let gi = 0, qty = 1;
  const dist = [5, 4, 3, 2, 1].map(s => p.reviewList.filter(r => r.rating === s).length);
  app.innerHTML = `<div class="crumb"><a href="#/">Home</a> / <a href="#/shop?category=${encodeURIComponent(p.category)}">${esc(p.category || 'Shop')}</a> / <span>${esc(p.name)}</span></div>
  <div class="detail"><div class="gal"><div class="gmain" id="gmain" tabindex="0">${n ? `<img id="gimg" src="${esc(g[0])}" alt="${esc(p.name)}">` : '<span class="noimg">🛍️</span>'}${o ? `<b class="bd red">-${o}%</b>` : ''}${n > 1 ? '<button class="gnav l" data-g="-1" aria-label="Previous image">‹</button><button class="gnav r" data-g="1" aria-label="Next image">›</button>' : ''}</div>
   ${n > 1 ? `<div class="thumbs">${g.map((s, i) => `<button class="th ${i ? '' : 'on'}" data-gi="${i}" aria-label="Image ${i + 1}"><img src="${esc(s)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
  <div class="pinfo"><div class="meta">${p.brand ? `<span>${esc(p.brand)}</span>` : ''}${p.category ? `<span>${esc(p.category)}</span>` : ''}${p.sku ? `<span>SKU: ${esc(p.sku)}</span>` : ''}</div>
   <h1>${esc(p.name)}</h1>${p.reviews ? `<div class="rt">${stars(p.rating)}<small>${p.rating} · ${p.reviews} review${p.reviews > 1 ? 's' : ''}</small></div>` : ''}
   <div class="big">${tk(p.price)} ${p.old_price > p.price ? `<s>${tk(p.old_price)}</s><b class="bd red">Save ${tk(p.old_price - p.price)}</b>` : ''}</div>
   <div class="stock ${p.stock < 1 ? 'no' : p.stock <= 5 ? 'low' : 'ok'}">${p.stock < 1 ? 'Out of stock' : p.stock <= 5 ? `Only ${p.stock} left` : 'In stock'}</div>
   <p class="desc">${esc(p.description || '')}</p>
   <div class="dlv">${ic('truck')}<span>Delivery: Dhaka ${tk(cfg.ship_dhaka)} · Outside Dhaka ${tk(cfg.ship_outside)}${+cfg.free_ship > 0 ? ` · Free over ${tk(cfg.free_ship)}` : ''}. Cash on Delivery.</span></div>
   ${p.stock > 0 ? `<div class="row"><b>Quantity</b><div class="qty"><button id="qm" aria-label="Decrease">${ic('minus')}</button><b id="qv">1</b><button id="qp" aria-label="Increase">${ic('plus')}</button></div></div>` : ''}
   <div class="actions"><button class="wbtn ${wish.includes(p.id) ? 'on' : ''}" data-w="${p.id}" aria-label="Wishlist">${ic('heart')}</button><button class="wbtn" id="sh" aria-label="Share">${ic('share')}</button>
    <button class="btn ghost" id="ad" ${p.stock < 1 ? 'disabled' : ''}>Add to Cart</button><button class="btn" id="bn" ${p.stock < 1 ? 'disabled' : ''}>Buy Now</button></div></div></div>
  <section class="sec"><div class="sh"><h2>Customer reviews</h2></div><div class="revs"><div class="box">${p.reviews ? `<div class="avg">${p.rating}</div>${stars(p.rating)}<small> ${p.reviews} review${p.reviews > 1 ? 's' : ''}</small>${dist.map((c, i) => `<div class="bar"><span>${5 - i}★</span><i><b style="width:${p.reviews ? c / p.reviews * 100 : 0}%"></b></i><span>${c}</span></div>`).join('')}` : '<p>No reviews yet.</p>'}</div>
   <div>${p.canReview ? `<div class="box"><h3>Write a review</h3><div class="sp5" id="sp5">${[1, 2, 3, 4, 5].map(i => `<button data-r="${i}" class="on" aria-label="${i} stars">★</button>`).join('')}</div><textarea id="rc" placeholder="Share your experience"></textarea><br><br><button class="btn" id="rs">Submit review</button></div>` : me ? '<p><small>Only customers with a delivered order can review this product.</small></p>' : ''}
   ${p.reviewList.map(r => `<div class="rv"><b>${esc(r.name)}</b> ${stars(r.rating)} <span class="vp">✓ Verified purchase</span> <small>${esc(dt(r.created))}</small>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</div>`).join('')}</div></div></section>
  ${sec('Related products', p.related)}<div id="rvw"></div>`;
  others.then(l => { if (t === routeId) { const x = l.filter(y => y.id !== p.id).slice(0, 4); $('#rvw').innerHTML = sec('Recently viewed', x) } });
  const setG = k => { gi = (k + n) % n; $('#gimg').src = g[gi]; $$('.th').forEach((b, i) => b.classList.toggle('on', i === gi)) };
  $$('[data-g]').forEach(b => b.onclick = e => { e.stopPropagation(); setG(gi + +b.dataset.g) });
  $$('[data-gi]').forEach(b => b.onclick = () => setG(+b.dataset.gi));
  const gm = $('#gmain'), im = $('#gimg');
  if (im) {
    gm.onmousemove = e => { if (!canHover) return; const r = gm.getBoundingClientRect(); im.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`; im.classList.add('zoom') };
    gm.onmouseleave = () => im.classList.remove('zoom');
    gm.onclick = e => { if (!e.target.closest('.gnav')) lightbox(g, gi) };
    gm.onkeydown = e => { if (n > 1 && e.key === 'ArrowLeft') setG(gi - 1); if (n > 1 && e.key === 'ArrowRight') setG(gi + 1) };
    let x0 = null; gm.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
    gm.addEventListener('touchend', e => { if (x0 != null && n > 1) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) setG(dx < 0 ? gi + 1 : gi - 1) } x0 = null });
  }
  if ($('#qm')) { $('#qm').onclick = () => { qty = Math.max(1, qty - 1); $('#qv').textContent = qty }; $('#qp').onclick = () => { if (qty >= p.stock) toast('Only ' + p.stock + ' available', 'err'); qty = Math.min(p.stock, qty + 1); $('#qv').textContent = qty } }
  $('#ad').onclick = () => {
    const c = cart.find(x => x.id == p.id); if (c && c.qty >= p.stock) return toast('Maximum available quantity is already in your cart', 'err');
    addCart(p.id, qty, p.stock); toast('Added to cart', 'ok', ['#/cart', 'View cart']);
  };
  $('#bn').onclick = () => { sessionStorage.setItem('buynow', JSON.stringify([{ id: p.id, qty }])); location.hash = '#/checkout' };
  $('#sh').onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: p.name, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Link copied') } } catch (e) { if (e.name !== 'AbortError') toast('Could not share. Copy the link from the address bar.', 'err') }
  };
  let rating = 5; $$('#sp5 button').forEach(b => b.onclick = () => { rating = +b.dataset.r; $$('#sp5 button').forEach(x => x.classList.toggle('on', +x.dataset.r <= rating)) });
  if ($('#rs')) $('#rs').onclick = async () => {
    $('#rs').disabled = true;
    try { await api(`/api/products/${p.id}/reviews`, { method: 'POST', body: { rating, comment: $('#rc').value } }); toast('Thanks for your review!'); product(id) } catch (e) { toast(e.message, 'err'); $('#rs').disabled = false }
  };
}
function lightbox(list, start) {
  let i = start; const el = document.createElement('div'); el.className = 'lb';
  el.innerHTML = `<button class="lx" aria-label="Close">${ic('x')}</button>${list.length > 1 ? '<button class="lp" aria-label="Previous">‹</button><button class="ln" aria-label="Next">›</button>' : ''}<img alt="">`;
  const im = $('img', el), show = () => im.src = list[i];
  const key = e => { if (e.key === 'Escape') close(); if (list.length > 1 && e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; show() } if (list.length > 1 && e.key === 'ArrowRight') { i = (i + 1) % list.length; show() } };
  const close = () => { el.remove(); document.removeEventListener('keydown', key) };
  $('.lx', el).onclick = close; el.onclick = e => { if (e.target === el) close() };
  if (list.length > 1) { $('.lp', el).onclick = () => { i = (i - 1 + list.length) % list.length; show() }; $('.ln', el).onclick = () => { i = (i + 1) % list.length; show() } }
  document.addEventListener('keydown', key); document.body.appendChild(el); show();
}

async function cartPage(first = true) {
  const t = routeId; sessionStorage.removeItem('buynow');
  if (!cart.length) return app.innerHTML = empty('🛒', 'Your cart is empty', 'Looks like you haven’t added anything yet.', '<a class="btn" href="#/shop">Start shopping</a>');
  if (first) app.innerHTML = '<div class="skb tall"></div>';
  const d = await api('/api/cart/preview', { method: 'POST', body: { items: cart, area: 'dhaka' } });
  if (t !== routeId) return;
  if (d.lines.length !== cart.length) toast('Some items are unavailable and were removed', 'err');
  cart = d.lines.map(l => ({ id: l.id, qty: l.qty })); saveCart();
  if (!d.lines.length) return app.innerHTML = empty('🛒', 'Your cart is empty', 'The items in your cart are no longer available.', '<a class="btn" href="#/shop">Continue shopping</a>');
  const fs = +cfg.free_ship;
  app.innerHTML = `<h1 class="pt">Shopping cart</h1><div class="cartw"><div class="box">
   ${fs > 0 ? `<div><small>${d.subtotal >= fs ? '🎉 You get free delivery!' : `Add ${tk(fs - d.subtotal)} more for free delivery`}</small><div class="prog"><i style="width:${Math.min(100, d.subtotal / fs * 100)}%"></i></div></div>` : ''}
   ${d.lines.map(l => `<div class="cl"><a class="th2" href="#/product/${l.id}">${l.image ? `<img src="${esc(l.image)}" alt="">` : '<span class="noimg">🛍️</span>'}</a>
    <div class="g"><a href="#/product/${l.id}">${esc(l.name)}</a><small>${tk(l.price)}${l.stock <= 5 ? ` · only ${l.stock} left` : ''}</small><div class="qty" style="margin-top:6px"><button data-d="-1" data-id="${l.id}" aria-label="Decrease">${ic('minus')}</button><b>${l.qty}</b><button data-d="1" data-id="${l.id}" aria-label="Increase">${ic('plus')}</button></div></div>
    <b>${tk(l.price * l.qty)}</b><button class="rm" data-rm="${l.id}" aria-label="Remove item">${ic('trash')}</button></div>`).join('')}
   <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="clr">Clear cart</button></div></div>
   <aside class="box sum"><h3>Order summary</h3><div class="sl"><span>Subtotal</span><b>${tk(d.subtotal)}</b></div><div class="sl"><small>Delivery charge is calculated at checkout</small></div>
   <div class="row" style="margin-top:14px"><a class="btn block" href="#/checkout">Proceed to Checkout</a><a class="btn ghost block" href="#/shop">Continue Shopping</a></div></aside></div>`;
  $$('[data-d]').forEach(b => b.onclick = () => {
    const c = cart.find(x => x.id == b.dataset.id), l = d.lines.find(x => x.id == b.dataset.id); if (!c) return;
    if (+b.dataset.d > 0 && c.qty >= l.stock) return toast('Only ' + l.stock + ' available', 'err');
    c.qty = Math.max(1, Math.min(l.stock, c.qty + +b.dataset.d)); saveCart(); cartPage(false);
  });
  $$('[data-rm]').forEach(b => b.onclick = () => { cart = cart.filter(x => x.id != b.dataset.rm); saveCart(); cartPage(false) });
  $('#clr').onclick = () => { if (confirm('Remove all items from your cart?')) { cart = []; saveCart(); cartPage(false) } };
}

async function checkout() {
  if (!me) { store.set('next', '#/checkout'); toast('Please login to continue', 'ok'); location.hash = '#/login'; return }
  const t = routeId; let items = JSON.parse(sessionStorage.getItem('buynow') || 'null') || cart;
  if (!items.length) { location.hash = '#/cart'; return }
  const sv = store.get('addr', {});
  const co = { name: sv.name || me.name, phone: sv.phone || me.phone || '', area: sv.area || 'dhaka', address: sv.address || '', note: '', coupon: '' };
  let step = 1, d = null, busy = false; const idem = uid();
  app.innerHTML = '<div class="skb tall"></div>';
  const refresh = async () => { d = await api('/api/cart/preview', { method: 'POST', body: { items, area: co.area, coupon: co.coupon } }); if (d.couponError) { toast(d.couponError, 'err'); co.coupon = '' } };
  await refresh(); if (t !== routeId) return;
  if (!d.lines.length) return app.innerHTML = empty('😕', 'Items unavailable', 'The products in your order are no longer available.', '<a class="btn" href="#/shop">Continue shopping</a>');
  const summary = () => `<h3>Order summary</h3>${d.lines.map(l => `<div class="sl"><span>${esc(l.name)} × ${l.qty}</span><b>${tk(l.price * l.qty)}</b></div>`).join('')}<hr>
   <div class="sl"><span>Subtotal</span><b>${tk(d.subtotal)}</b></div>${d.discount ? `<div class="sl ok"><span>Discount (${esc(d.coupon)})</span><b>-${tk(d.discount)}</b></div>` : ''}
   <div class="sl"><span>Delivery</span><b>${d.shipping ? tk(d.shipping) : 'Free'}</b></div><div class="sl tot"><span>Total</span><b>${tk(d.total)}</b></div>`;
  const validate = () => {
    const e = {}; if (!co.name.trim()) e.name = 'Enter your full name';
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(co.phone)) e.phone = 'Enter a valid BD mobile number (01XXXXXXXXX)';
    if (co.address.trim().length < 10) e.address = 'Enter your full address (area, thana, district)'; return e;
  };
  const panel = () => {
    if (step === 1) return `<div class="box"><h3>Review your items</h3>${d.lines.map(l => `<div class="cl"><div class="th2">${l.image ? `<img src="${esc(l.image)}" alt="">` : ''}</div><div class="g"><b>${esc(l.name)}</b><br><small>${tk(l.price)} × ${l.qty}</small></div><b>${tk(l.price * l.qty)}</b></div>`).join('')}</div>
     <div class="box"><h3>Have a coupon?</h3><div class="row" style="flex-wrap:nowrap"><input id="cp" placeholder="Enter code" value="${esc(co.coupon)}" style="text-transform:uppercase"><button class="btn ghost" id="cpa">Apply</button></div>${d.coupon ? `<p class="okt">Coupon ${esc(d.coupon)} applied: -${tk(d.discount)}</p>` : ''}</div>
     <div class="row end"><a class="btn ghost" href="#/cart">Back to cart</a><button class="btn" id="nx">Continue</button></div>`;
    if (step === 2) return `<form class="box" id="af" novalidate><h3>Delivery details</h3><div class="form2">
     <label class="fld">Full name<input name="name" value="${esc(co.name)}" autocomplete="name"><em data-e="name"></em></label>
     <label class="fld">Mobile number<input name="phone" value="${esc(co.phone)}" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX"><em data-e="phone"></em></label>
     <label class="fld full">Delivery area<select name="area"><option value="dhaka" ${co.area === 'dhaka' ? 'selected' : ''}>Inside Dhaka</option><option value="outside" ${co.area === 'outside' ? 'selected' : ''}>Outside Dhaka</option></select></label>
     <label class="fld full">Full address<textarea name="address" placeholder="House, road, area, thana, district, postal code" autocomplete="street-address">${esc(co.address)}</textarea><em data-e="address"></em></label>
     <label class="fld full">Delivery note (optional)<input name="note" value="${esc(co.note)}" maxlength="300"></label></div>
     <div class="row end"><button type="button" class="btn ghost" id="bk">Back</button><button class="btn">Continue</button></div></form>`;
    return `<div class="box"><div class="row" style="justify-content:space-between"><h3>Delivering to</h3><a href="javascript:void 0" id="ed"><small><u>Edit</u></small></a></div><p style="margin:0"><b>${esc(co.name)}</b> · ${esc(co.phone)}<br>${esc(co.address)}<br><small>${co.area === 'dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}${co.note ? ' · Note: ' + esc(co.note) : ''}</small></p></div>
     <div class="box"><h3>Payment</h3><p style="margin:0">💵 <b>Cash on Delivery</b><br><small>Pay in cash when your order arrives.</small></p></div>
     <div class="row end"><button class="btn ghost" id="bk">Back</button><button class="btn" id="po">Place order · ${tk(d.total)}</button></div>`;
  };
  const draw = () => {
    app.innerHTML = `<h1 class="pt">Checkout</h1><div class="stepper">${['Review', 'Delivery', 'Confirm'].map((s, i) => `<div class="st ${i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''}"><span>${i + 1 < step ? ic('check') : i + 1}</span><b>${s}</b></div>`).join('<i></i>')}</div>
    <div class="cow"><div>${panel()}</div><aside class="box sum">${summary()}</aside></div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const back = () => { step--; draw() };
    if ($('#bk')) $('#bk').onclick = back;
    if (step === 1) {
      $('#nx').onclick = () => { step = 2; draw() };
      $('#cpa').onclick = async () => { co.coupon = $('#cp').value.trim().toUpperCase(); try { await refresh(); if (d.coupon) toast('Coupon applied') } catch (e) { toast(e.message, 'err') } draw() };
    }
    if (step === 2) {
      $('#af select[name=area]').onchange = async e => { co.area = e.target.value; try { await refresh(); $('.sum').innerHTML = summary() } catch (er) { toast(er.message, 'err') } };
      $('#af').onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); Object.assign(co, { name: f.name, phone: f.phone.replace(/[\s-]/g, ''), area: f.area, address: f.address, note: f.note });
        const er = validate(); $$('[data-e]').forEach(x => x.textContent = er[x.dataset.e] || '');
        if (Object.keys(er).length) return $(`[name=${Object.keys(er)[0]}]`).focus();
        try { await refresh(); step = 3; draw() } catch (x) { toast(x.message, 'err') }
      };
    }
    if (step === 3) {
      $('#ed').onclick = () => { step = 2; draw() };
      $('#po').onclick = async () => {
        if (busy) return; busy = true; const b = $('#po'); b.disabled = true; b.textContent = 'Placing order…';
        try {
          const r = await api('/api/orders', { method: 'POST', body: { items, name: co.name, phone: co.phone, address: co.address, area: co.area, note: co.note, coupon: co.coupon, idem } });
          store.set('addr', { name: co.name, phone: co.phone, area: co.area, address: co.address });
          if (sessionStorage.getItem('buynow')) sessionStorage.removeItem('buynow'); else { cart = []; saveCart() }
          toast('Order placed successfully 🎉'); location.hash = '#/order/' + r.id;
        } catch (e) {
          busy = false; toast(e.message, 'err');
          try { await refresh() } catch { }
          if (!d.lines.length) { location.hash = '#/cart'; return }
          items.splice(0, items.length, ...d.lines.map(l => ({ id: l.id, qty: l.qty }))); if (items === cart) saveCart();
          step = 1; draw();
        }
      };
    }
  };
  draw();
}

function loginPage(mode = 'login') {
  if (me) { location.hash = '#/orders'; return }
  app.innerHTML = `<form class="box auth" id="f" novalidate><h2>${mode === 'login' ? 'Welcome back' : 'Create account'}</h2><p><small>${mode === 'login' ? 'Login to track orders and checkout faster.' : 'Join to place orders and write reviews.'}</small></p>
   ${mode === 'register' ? '<label class="fld">Full name<input name="name" autocomplete="name"></label><label class="fld">Mobile number<input name="phone" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel"></label>' : ''}
   <label class="fld">Email<input name="email" type="email" autocomplete="email"></label>
   <label class="fld">Password<input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'register' ? 'At least 8 characters' : ''}"></label>
   <button class="btn block" id="sb">${mode === 'login' ? 'Login' : 'Create account'}</button><p class="err" id="e" role="alert"></p>
   <p style="text-align:center;margin:0"><a href="javascript:void 0" id="sw"><u>${mode === 'login' ? 'New here? Create an account' : 'Already have an account? Login'}</u></a></p></form>`;
  $('#sw').onclick = () => loginPage(mode === 'login' ? 'register' : 'login');
  $('#f').onsubmit = async e => {
    e.preventDefault(); const b = $('#sb'); b.disabled = true; $('#e').textContent = '';
    try {
      await api('/api/' + mode, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      me = await api('/api/me'); paintAcct(); toast('Welcome, ' + me.name.split(' ')[0] + '!');
      const n = store.get('next', '#/'); store.set('next', null); location.hash = n;
    } catch (er) { $('#e').textContent = er.message; b.disabled = false }
  };
}
async function orders() {
  if (!me) { location.hash = '#/login'; return }
  const t = routeId; const list = await api('/api/orders'); if (t !== routeId) return;
  app.innerHTML = `<div class="box row" style="justify-content:space-between"><div><h2 style="margin:0">Hi, ${esc(me.name)}</h2><small>${esc(me.email)} · ${esc(me.phone)}</small></div><div class="row"><a class="btn ghost sm" href="#/wishlist">Wishlist</a><button class="btn ghost sm" id="lo">Logout</button></div></div>
   <h3>My orders</h3>${list.map(o => `<a class="box olink" href="#/order/${esc(o.id)}"><div><b>${esc(o.id)}</b><br><small>${esc(dt(o.created))}</small></div><span class="chipx s-${esc(o.status)}">${esc(o.status)}</span><b>${tk(o.total)}</b></a>`).join('') || empty('📦', 'No orders yet', 'When you place an order it will appear here.', '<a class="btn" href="#/shop">Start shopping</a>')}`;
  $('#lo').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => { }); me = null; paintAcct(); toast('Logged out'); location.hash = '#/' };
}
async function orderPage(id) {
  if (!me) { store.set('next', location.hash); location.hash = '#/login'; return }
  const t = routeId; const o = await api('/api/orders/' + encodeURIComponent(id)); if (t !== routeId) return;
  const flow = [['Pending', 'Order placed'], ['Confirmed', 'Confirmed'], ['Processing', 'Being prepared'], ['Shipped', 'Shipped'], ['Delivered', 'Delivered']];
  const ev = s => (o.events.find(e => e.status === s) || {}).created;
  const cancelled = o.status === 'Cancelled', idx = flow.findIndex(f => f[0] === o.status);
  const stepsHtml = cancelled
    ? `<div class="ts done"><i>${ic('check')}</i><b>Order placed</b><small>${esc(dt(ev('Pending')))}</small></div><div class="ts bad"><i>${ic('x')}</i><b>Cancelled</b><small>${esc(dt(ev('Cancelled')))}</small></div>`
    : flow.map((f, i) => `<div class="ts ${i < idx || o.status === 'Delivered' ? 'done' : i === idx ? 'cur' : ''}"><i>${i < idx || o.status === 'Delivered' ? ic('check') : ''}</i><b>${f[1]}</b><small>${ev(f[0]) ? esc(dt(ev(f[0]))) : ''}</small></div>`).join('');
  app.innerHTML = `<div class="crumb"><a href="#/orders">My orders</a> / <span>${esc(o.id)}</span></div><h1 class="pt">Order ${esc(o.id)}</h1>
  <div class="cartw"><div><div class="box"><h3>Order progress</h3><div class="tl">${stepsHtml}</div>${o.tracking ? `<hr><p style="margin:0">Tracking number: <b>${esc(o.tracking)}</b></p>` : ''}</div>
  <div class="box"><h3>Items</h3>${o.items.map(i => `<div class="sl"><span>${esc(i.name)} × ${i.qty}</span><b>${tk(i.price * i.qty)}</b></div>`).join('')}</div></div>
  <aside class="box sum"><h3>Summary</h3><div class="sl"><span>Subtotal</span><b>${tk(o.subtotal)}</b></div>${o.discount ? `<div class="sl ok"><span>Discount (${esc(o.coupon)})</span><b>-${tk(o.discount)}</b></div>` : ''}<div class="sl"><span>Delivery</span><b>${o.shipping ? tk(o.shipping) : 'Free'}</b></div><div class="sl tot"><span>Total</span><b>${tk(o.total)}</b></div>
  <hr><small>Payment</small><p style="margin:0 0 10px"><b>${esc(o.payment)}</b></p><small>Delivery address</small><p style="margin:0 0 10px">${esc(o.name)} · ${esc(o.phone)}<br>${esc(o.address)}</p>
  ${['Pending', 'Confirmed'].includes(o.status) ? '<button class="btn ghost block" id="cx">Cancel order</button>' : ''}</aside></div>`;
  if ($('#cx')) $('#cx').onclick = async () => {
    if (!confirm('Cancel this order?')) return;
    try { await api(`/api/orders/${encodeURIComponent(o.id)}/cancel`, { method: 'POST' }); toast('Order cancelled'); orderPage(id) } catch (e) { toast(e.message, 'err') }
  };
}
async function wishlist() {
  const t = routeId; if (!wish.length) return app.innerHTML = empty('💜', 'Your wishlist is empty', 'Tap the heart on any product to save it here.', '<a class="btn" href="#/shop">Browse products</a>');
  app.innerHTML = `<div class="grid">${skel(4)}</div>`;
  const l = await api('/api/products/by-ids?ids=' + wish.join(',')); if (t !== routeId) return;
  wish = l.map(p => p.id); saveWish();
  app.innerHTML = `<h1 class="pt">Wishlist</h1>` + (l.length ? `<div class="grid">${l.map((p, i) => card(p, i)).join('')}</div>` : empty('💜', 'Your wishlist is empty', 'Saved products are no longer available.', '<a class="btn" href="#/shop">Browse products</a>'));
}
function pageStatic(k) {
  const t = Object.fromEntries(PAGES)[k];
  if (!t) return app.innerHTML = empty('🔍', 'Page not found', '', '<a class="btn" href="#/">Go home</a>');
  app.innerHTML = `<article class="doc box"><h1>${esc(t)}</h1><div class="prose">${esc(cfg[k] || 'This page has not been written yet.')}</div></article>`;
}

// ---------- router ----------
async function route() {
  clearInterval(sliderT); sug.hidden = true; const t = ++routeId;
  const { parts, q } = Q(), [page, arg] = parts;
  document.body.classList.toggle('pdp', page === 'product');
  const key = { orders: 'account', login: 'account', order: 'account' }[page] || page || 'home';
  $$('.bnav a').forEach(a => a.classList.toggle('on', a.dataset.r === key));
  if (page !== 'shop') { si.value = ''; $('#sclear').hidden = true }
  paintCats(); app.classList.remove('pg'); void app.offsetWidth; app.classList.add('pg'); window.scrollTo(0, 0);
  try {
    if (!page) await home(); else if (page === 'shop') await shop(q); else if (page === 'product') await product(arg);
    else if (page === 'cart') await cartPage(); else if (page === 'checkout') await checkout(); else if (page === 'login') loginPage();
    else if (page === 'orders') await orders(); else if (page === 'order') await orderPage(arg); else if (page === 'wishlist') await wishlist();
    else if (page === 'page') pageStatic(arg); else app.innerHTML = empty('🔍', 'Page not found', 'The page you are looking for does not exist.', '<a class="btn" href="#/">Go home</a>');
  } catch (e) { if (t === routeId) app.innerHTML = errBox(e.message) }
}
addEventListener('hashchange', route);
(async () => {
  saveCart(); saveWish(); setTheme(document.documentElement.dataset.theme);
  const [c, m, cs] = await Promise.all([api('/api/settings').catch(() => ({})), api('/api/me').catch(() => null), api('/api/categories').catch(() => [])]);
  cfg = c; me = m; cats = cs; paintCfg(); paintAcct(); route();
})();