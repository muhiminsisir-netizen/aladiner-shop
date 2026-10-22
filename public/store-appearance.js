'use strict';
/* store-appearance.js : index.html er shesh e load hobe. Banner slider, collapsible service section, product-card glow. */
(() => {
  const root = document.documentElement, DEF = { default_show: true, default_when: 'fallback', default_title: '', default_subtitle: '', default_btn: 'Shop now', default_link: '#/shop', default_image: '', interval: 3, svc_open: false, glow: true, glow_intensity: 6, glow_blur: 28, glow_opacity: .45, glow_dur: 300, glow_color: '#4f46e5' };
  let ap = { ...DEF }; try { ap = { ...DEF, ...JSON.parse(localStorage.getItem('ap') || '{}') }; } catch { }
  const vars = () => {
    root.classList.toggle('ap-glow', !!ap.glow); const s = root.style;
    s.setProperty('--ap-blur', ap.glow_blur + 'px'); s.setProperty('--ap-spread', ap.glow_intensity + 'px'); s.setProperty('--ap-pct', Math.round(ap.glow_opacity * 100) + '%');
    s.setProperty('--ap-dur', ap.glow_dur + 'ms'); s.setProperty('--ap-fb', ap.glow_color);
  };
  vars(); document.body.classList.add('ap-on');
  const getJ = u => fetch(u).then(r => r.ok ? r.json() : Promise.reject());
  const load = () => Promise.all([getJ('/api/appearance'), getJ('/api/banners')]).then(([a, b]) => { ap = { ...DEF, ...a }; try { localStorage.setItem('ap', JSON.stringify(a)); } catch { } vars(); return b; });

  // ---- dominant colour glow ----
  const cache = new Map();
  const dom = im => {
    const k = im.currentSrc || im.src; if (cache.has(k)) return cache.get(k); let c = null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16; const x = cv.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue; const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 510, s = mx ? (mx - mn) / mx : 0;
        if (l > .93 || l < .07) continue; const q = .15 + s * s * 3; r += R * q; g += G * q; b += B * q; w += q;
      }
      if (w > 0) c = `rgb(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)})`;
    } catch { }
    cache.set(k, c); return c;
  };
  const glow = e => {
    if (!ap.glow) return; const c = e.target.closest && e.target.closest('.card'); if (!c || c.dataset.g) return;
    const im = c.querySelector('.media img'); if (!im || !im.complete || !im.naturalWidth) return;
    const col = dom(im); if (col) c.style.setProperty('--glow', col); c.dataset.g = 1;
  };
  ['mouseover', 'focusin', 'touchstart'].forEach(t => document.addEventListener(t, glow, { passive: true }));

  // ---- banner slider ----
  const FS = { s: 'clamp(18px,3vw,26px)', m: 'clamp(22px,3.8vw,38px)', l: 'clamp(28px,5.5vw,56px)' }, JP = { top: 'flex-start', center: 'center', bottom: 'flex-end' }, JA = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const slideHTML = (b, i) => {
    const st = `--tc:${esc(b.text_color || '#ffffff')};--fs:${FS[b.font_size] || FS.m};--fw:${+b.font_weight || 700};--ta:${b.align || 'left'};--ja:${JA[b.align] || 'flex-start'};--jp:${JP[b.pos] || 'flex-end'}`;
    const img = b.image ? `<img src="${esc(b.image)}" alt="" ${i ? 'loading="lazy"' : ''}>` : '';
    const cap = `<div class="ap-cap">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${b.subtitle ? `<span class="ap-sub">${esc(b.subtitle)}</span>` : ''}${b.description ? `<p>${esc(b.description)}</p>` : ''}${b.btn_text && b.link ? `<a class="btn sm" href="${esc(b.link)}">${esc(b.btn_text)}</a>` : ''}</div>`;
    const cls = 'ap-slide' + (b.image ? '' : ' noimg') + (b.default_banner ? ' ap-default' : '');
    const art = b.default_banner && !b.image ? `<div class="ap-diorama" aria-hidden="true"><div class="ap-box-glow"></div><div class="ap-cube-scene"><div class="ap-cube">
      <div class="ap-cube-face front"><svg class="ap-shop-symbol" viewBox="0 0 64 64"><path d="M12 24h40l-4 32H16l-4-32Z"/><path d="M22 26v-7a10 10 0 0 1 20 0v7"/><path d="m25 40 5 5 10-11"/></svg><b>${esc(cfg.store_name || 'YOUR STORE')}</b><small>SHOP · DISCOVER · ENJOY</small><i>✦ PREMIUM PICKS</i></div>
      <div class="ap-cube-face right"><span class="ap-mini-icons"><b>✦</b><b>🛍</b><b>★</b></span><strong>FIND YOUR<br>FAVOURITES</strong><small>CURATED FOR YOU</small></div>
      <div class="ap-cube-face back"><span class="ap-back-seal">S</span><b>GOOD THINGS<br>ARE IN STORE</b><small>QUALITY · CARE · STYLE</small></div>
      <div class="ap-cube-face left"><strong>NEW<br>DISCOVERIES</strong><span class="ap-left-spark">✧</span><small>MADE TO DELIGHT</small></div>
      <div class="ap-cube-face top"><span>✦　✧　✦</span><b>WELCOME</b></div><div class="ap-cube-face bottom"><span>♥　★　♥</span></div>
    </div></div><div class="ap-box-floor"></div></div>` : '';
    return b.link && !b.btn_text ? `<a class="${cls}" style="${st}" href="${esc(b.link)}">${img}${art}${cap}</a>` : `<div class="${cls}" style="${st}">${img}${art}${cap}</div>`;
  };
  function build(list) {
    const el = document.createElement('section'); el.className = 'ap-slider'; el.tabIndex = 0; el.setAttribute('aria-roledescription', 'carousel'); el.setAttribute('aria-label', 'Promotions');
    const n = list.length;
    el.innerHTML = `<div class="ap-track">${list.map(slideHTML).join('')}</div>` + (n > 1 ? `<button class="arw l" aria-label="Previous">‹</button><button class="arw r" aria-label="Next">›</button><div class="dots">${list.map((_, i) => `<button aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : '');
    const sl = [...el.querySelectorAll('.ap-slide')], dots = [...el.querySelectorAll('.dots button')]; let i = 0, t = null, sw = 0;
    const show = k => { i = (k + n) % n; sl.forEach((s, j) => s.classList.toggle('on', j === i)); dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
    show(0);
    sl.forEach(s => { const im = s.querySelector('img'); if (im) im.addEventListener('error', () => { im.remove(); s.classList.add('noimg'); }); });
    if (n > 1) {
      const ms = Math.max(2, Math.min(10, +ap.interval || 3)) * 1000, rm = matchMedia('(prefers-reduced-motion:reduce)').matches;
      const stop = () => { clearInterval(t); t = null; }, play = () => { stop(); if (!rm) t = setInterval(() => { if (!el.isConnected) return stop(); if (!document.hidden) show(i + 1); }, ms); };
      el.querySelector('.arw.l').onclick = e => { e.preventDefault(); show(i - 1); play(); }; el.querySelector('.arw.r').onclick = e => { e.preventDefault(); show(i + 1); play(); };
      dots.forEach((d, j) => d.onclick = () => { show(j); play(); });
      if (matchMedia('(hover:hover)').matches) { el.onmouseenter = stop; el.onmouseleave = play; }
      el.addEventListener('focusin', stop); el.addEventListener('focusout', play);
      el.onkeydown = e => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); };
      let x0 = null;
      el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
      el.addEventListener('touchend', e => { if (x0 != null) { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { sw = 1; show(dx < 0 ? i + 1 : i - 1); } } x0 = null; play(); });
      el.addEventListener('click', e => { if (sw) { e.preventDefault(); sw = 0; } }, true);
      play();
    }
    return el;
  }
  const defSlide = () => ({ default_banner: true, title: ap.default_title || cfg.store_name || 'Welcome', subtitle: ap.default_subtitle || 'Quality products, simple checkout and Cash on Delivery', btn_text: ap.default_btn, link: ap.default_link, image: ap.default_image, text_color: '#ffffff', font_size: 'l', font_weight: 800, align: 'left', pos: 'center' });
  const pick = bn => { const d = ap.default_show !== false; if (bn.length) return d && ap.default_when === 'always' ? [defSlide(), ...bn] : bn; return d ? [defSlide()] : []; };
  const welcome = () => { const s = document.createElement('section'); s.className = 'ap-welcome'; s.innerHTML = `<h1>${esc(cfg.store_name || 'Shop')}</h1><p>Browse our latest products below.</p>`; return s; };

  // ---- collapsible service and category section ----
  function collapse(f) {
    f.dataset.ap = 1; const w = document.createElement('div'), inn = document.createElement('div'), h = document.createElement('button');
    w.className = 'ap-svc'; w.id = 'apsvc'; inn.className = 'ap-svc-in'; f.replaceWith(w); w.appendChild(inn); inn.appendChild(f);
    h.type = 'button'; h.className = 'ap-handle'; h.setAttribute('aria-controls', 'apsvc'); h.setAttribute('aria-label', 'Delivery, service and shop by category');
    h.innerHTML = '<span class="ln"></span><span class="chev"><svg class="ic" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span><span class="ln"></span>'; w.before(h);
    const set = o => { w.classList.toggle('open', o); h.setAttribute('aria-expanded', o); w.inert = !o; w.setAttribute('aria-hidden', !o); };
    set(!!ap.svc_open); h.onclick = () => set(!w.classList.contains('open'));
  }

  let busy = false, failed = false;
  async function enh() {
    const h = location.hash; if (h && h !== '#' && h !== '#/') return;
    const old = document.querySelector('#app>.hero,#app>.slider'), feats = document.querySelector('#app>.home-discovery');
    if (old && !busy && !failed) {
      busy = true;
      try { const bn = await load(); if (old.isConnected) { const l = pick(bn); old.replaceWith(l.length ? build(l) : welcome()); } }
      catch { failed = true; document.body.classList.remove('ap-on'); } finally { busy = false; }
    }
    const f2 = document.querySelector('#app>.home-discovery'); if (f2 && !f2.dataset.ap) collapse(f2);
  }
  addEventListener('hashchange', () => { failed = false; document.body.classList.add('ap-on'); });
  new MutationObserver(enh).observe(document.getElementById('app'), { childList: true, subtree: true });
  enh();
})();
