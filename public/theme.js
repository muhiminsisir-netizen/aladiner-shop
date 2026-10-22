'use strict';
/* theme.js : index.html er <head> e load hobe (theme.css er pore). Admin er color gulo apply kore. */
(() => {
  const K = ['c_deep', 'c_forest', 'c_sage', 'c_light', 'c_brown', 'c_tan', 'c_cream', 'c_gold',
    'o_bg', 'o_surface', 'o_text', 'o_muted', 'o_primary', 'o_accent', 'o_danger', 'o_ann_bg', 'o_ann_tx', 'o_foot_bg', 'o_foot_tx'];
  const ok = v => /^#[0-9a-f]{6}$/i.test(v || '');
  const apply = c => {
    const s = document.documentElement.style;
    K.forEach(k => { const n = '--' + k.replace(/_/g, '-'); ok(c[k]) ? s.setProperty(n, c[k]) : s.removeProperty(n); });
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = ok(c.o_primary) ? c.o_primary : ok(c.c_forest) ? c.c_forest : '#1D4ED8';
  };
  // purano color diye age thekei dekhao (flash hoy na), tarpor server theke notun ta nao
  try { apply(JSON.parse(localStorage.getItem('themeColors') || '{}')); } catch { }
  fetch('/api/settings').then(r => r.json()).then(s => {
    const c = {}; K.forEach(k => c[k] = s[k]);
    try { localStorage.setItem('themeColors', JSON.stringify(c)); } catch { }
    apply(c);
  }).catch(() => { });
})();