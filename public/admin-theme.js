'use strict';
/* admin-theme.js : admin.html er shesh e load hobe. Sidebar e "Theme & Colors" section ane. */
(() => {
  const ROLES = [
    ['c_deep', 'Dark color', 'Announcement bar, footer, dark ongsho'],
    ['c_forest', 'Main color', 'Button, link, active item'],
    ['c_sage', 'Main color (light)', 'Hover, gradient er shesh'],
    ['c_light', 'Soft tint', 'Halka background, hero glow'],
    ['c_brown', 'Secondary text', 'Choto grey/slate text'],
    ['c_tan', 'Border tone', 'Border ar halka line'],
    ['c_cream', 'Page tint', 'Page background (light mode)'],
    ['c_gold', 'Highlight', 'New badge, star, cart count']
  ];
  const ADV = [
    ['o_bg', 'Page background', 'light mode'],
    ['o_surface', 'Cards & boxes', 'light mode'],
    ['o_text', 'Main text', 'light mode'],
    ['o_muted', 'Secondary text', 'light mode'],
    ['o_primary', 'Buttons & links', 'ek rong (gradient hobe na)'],
    ['o_accent', 'Badges, stars, cart count', ''],
    ['o_danger', 'Sale / error red', ''],
    ['o_ann_bg', 'Announcement bar background', ''],
    ['o_ann_tx', 'Announcement bar text', ''],
    ['o_foot_bg', 'Footer background', ''],
    ['o_foot_tx', 'Footer text', '']
  ];
  const P = (a, b, c, d, e, f, g, h) => ({ c_deep: a, c_forest: b, c_sage: c, c_light: d, c_brown: e, c_tan: f, c_cream: g, c_gold: h });
  const PRESETS = {
    'Royal Blue (default)': P('#0B2A5B', '#1D4ED8', '#3B82F6', '#BFDBFE', '#475569', '#94A3B8', '#DBEAFE', '#F59E0B'),
    'Sky & Navy': P('#0C2D48', '#0369A1', '#38BDF8', '#BAE6FD', '#475569', '#7DA3BD', '#E0F2FE', '#FBBF24'),
    'Midnight & Gold': P('#0A1128', '#1E3A8A', '#2F55C4', '#C7D2FE', '#475569', '#8A94A6', '#E6EAF5', '#D4A84B'),
    'Rose': P('#4A1020', '#BE123C', '#E11D48', '#FECDD3', '#6B4E57', '#B08A93', '#FFE4E6', '#F59E0B'),
    'Classic Indigo': P('#1e1b4b', '#4f46e5', '#6366f1', '#c7d2fe', '#475569', '#94a3b8', '#e2e8f0', '#f59e0b'),
    'Forest Green': P('#0E3B32', '#1F6F5A', '#4E8F6F', '#A7C4A0', '#6B4E3D', '#A87C5A', '#E8D6B8', '#D9B87A')
  };
  const DEFNAME = 'Royal Blue (default)';
  const hex = v => /^#[0-9a-f]{6}$/i.test(String(v || '').trim());
  const blankAdv = () => Object.fromEntries(ADV.map(([k]) => [k, '']));

  const applyAdmin = c => {
    const s = document.documentElement.style, p = hex(c.o_primary) ? c.o_primary : c.c_forest;
    if (hex(p)) s.setProperty('--pr', p);
    if (hex(c.o_primary)) s.setProperty('--grad', c.o_primary);
    else if (hex(c.c_deep) && hex(c.c_forest) && hex(c.c_sage))
      s.setProperty('--grad', 'linear-gradient(135deg,' + c.c_deep + ',' + c.c_forest + ' 60%,' + c.c_sage + ')');
  };
  fetch('/api/settings').then(r => r.json()).then(applyAdmin).catch(() => { });

  async function themeTab() {
    const s = await fetch('/api/settings').then(r => r.json());
    const cur = { ...blankAdv() };
    ROLES.forEach(([k]) => cur[k] = hex(s[k]) ? s[k] : PRESETS[DEFNAME][k]);
    ADV.forEach(([k]) => cur[k] = hex(s[k]) ? s[k] : '');
    const v = document.getElementById('view');
    const names = Object.keys(PRESETS);
    const nameOf = () => names.find(n => ROLES.every(([k]) => PRESETS[n][k].toLowerCase() === String(cur[k]).toLowerCase()) && ADV.every(([k]) => !cur[k])) || 'Custom';

    v.innerHTML = `<div class="box"><label class="f" style="max-width:360px;margin:0">Theme name
       <select id="tname">${names.concat('Custom').map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
      <p><small>Ekta theme baachle shob color ek sathe boshe jabe. Tarpor nicher color e nijer moto bodlate paro. Shesh e "Save theme" chapo.</small></p></div>
     <div class="two"><div>
      <div class="box"><b>Base colors</b>
       ${ROLES.map(([k, n, d]) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--bd);flex-wrap:nowrap">
         <input type="color" data-c="${k}" value="${cur[k]}" style="width:48px;height:40px;padding:2px;flex:none">
         <div style="flex:1;min-width:0"><b>${n}</b><br><small>${d}</small></div>
         <input type="text" data-h="${k}" value="${cur[k]}" maxlength="7" style="width:96px;flex:none"></div>`).join('')}</div>
      <details class="box" ${ADV.some(([k]) => cur[k]) ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">Advanced: protita jinis alada color</summary>
       <p><small>Khali ("Auto") rakhle base color theke auto toiri hoy. Dark mode e background/text auto thake.</small></p>
       ${ADV.map(([k, n, d]) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--bd);flex-wrap:nowrap">
         <input type="color" data-c="${k}" value="${hex(cur[k]) ? cur[k] : '#ffffff'}" style="width:48px;height:40px;padding:2px;flex:none">
         <div style="flex:1;min-width:0"><b>${n}</b>${d ? `<br><small>${d}</small>` : ''}</div>
         <input type="text" data-h="${k}" value="${cur[k]}" placeholder="Auto" maxlength="7" style="width:84px;flex:none">
         <button type="button" class="btn gh sm" data-auto="${k}">Auto</button></div>`).join('')}</details>
      <div class="row"><button class="btn" id="tsave">Save theme</button><span class="err" id="terr"></span></div>
     </div>
     <div class="box" style="position:sticky;top:12px;align-self:start"><b>Live preview</b><div id="tprev" style="margin-top:10px"></div>
      <p><small>Save korle customer ra porer bar page khulle notun color dekhbe.</small></p></div></div>`;

    const prev = () => {
      const c = cur, e = {
        ann: c.o_ann_bg || c.c_deep, annT: c.o_ann_tx || c.c_gold,
        bg: c.o_bg || `color-mix(in srgb,${c.c_cream} 38%,white)`, sf: c.o_surface || `color-mix(in srgb,${c.c_cream} 14%,white)`,
        tx: c.o_text || `color-mix(in srgb,${c.c_deep} 72%,black)`, mu: c.o_muted || c.c_brown,
        btn: c.o_primary || `linear-gradient(135deg,${c.c_deep},${c.c_forest} 60%,${c.c_sage})`, pr: c.o_primary || c.c_forest,
        ac: c.o_accent || c.c_gold, dg: c.o_danger || '#dc2626', ft: c.o_foot_bg || c.c_deep, ftT: c.o_foot_tx || c.c_cream
      };
      document.getElementById('tprev').innerHTML = `<div style="border-radius:16px;overflow:hidden;border:1px solid ${c.c_tan}66;background:${e.bg}">
       <div style="background:${e.ann};color:${e.annT};text-align:center;padding:7px;font-size:12px;font-weight:600">Cash on Delivery available</div>
       <div style="padding:14px">
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px"><b style="font-size:18px;color:${e.pr}">My Shop</b>
         <span style="margin-left:auto;background:${e.ac};color:${c.c_deep};font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px">New</span></div>
        <div style="background:${e.sf};border:1px solid ${c.c_tan}66;border-radius:14px;padding:12px;color:${e.tx}">
         <b>Cotton T-Shirt</b><br><span style="color:${e.mu};font-size:13px">Fashion · <span style="color:${e.ac}">★★★★★</span></span>
         <div style="margin:10px 0 12px"><b>৳650</b> <s style="color:${e.mu};font-size:12px">৳850</s> <span style="background:${e.dg};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px">-24%</span></div>
         <span style="display:inline-block;background:${e.btn};color:#fff;padding:9px 18px;border-radius:12px;font-weight:700;font-size:14px">Add to cart</span></div>
       </div>
       <div style="background:${e.ft};color:${e.ftT};padding:12px 14px;font-size:12px">© My Shop · Footer</div></div>
       <div style="display:flex;gap:6px;margin-top:10px">${ROLES.map(([k]) => `<i style="flex:1;height:22px;border-radius:6px;background:${c[k]}"></i>`).join('')}</div>`;
      document.getElementById('tname').value = nameOf();
    };
    const sync = k => {
      const p = v.querySelector(`[data-c="${k}"]`), t = v.querySelector(`[data-h="${k}"]`);
      if (hex(cur[k])) p.value = cur[k];
      t.value = cur[k];
    };
    v.querySelectorAll('[data-c]').forEach(i => i.oninput = () => { cur[i.dataset.c] = i.value; sync(i.dataset.c); prev(); });
    v.querySelectorAll('[data-h]').forEach(i => i.oninput = () => {
      let x = i.value.trim(); const k = i.dataset.h, isAdv = k.startsWith('o_');
      if (!x && isAdv) { cur[k] = ''; prev(); return; }
      if (x && x[0] !== '#') x = '#' + x;
      if (hex(x)) { cur[k] = x; v.querySelector(`[data-c="${k}"]`).value = x; prev(); }
    });
    v.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { cur[b.dataset.auto] = ''; sync(b.dataset.auto); prev(); });
    document.getElementById('tname').onchange = e => {
      const p = PRESETS[e.target.value]; if (!p) return;
      Object.assign(cur, p, blankAdv()); [...ROLES, ...ADV].forEach(([k]) => sync(k)); prev();
    };
    document.getElementById('tsave').onclick = async () => {
      const b = document.getElementById('tsave'), er = document.getElementById('terr');
      er.textContent = '';
      if (!ROLES.every(([k]) => hex(cur[k]))) return er.textContent = 'Base color gulo valid hex hote hobe (#RRGGBB)';
      b.disabled = true;
      try { await api('/api/admin/settings', { method: 'POST', body: cur }); applyAdmin(cur); toast('Theme saved'); }
      catch (e) { er.textContent = e.message; }
      b.disabled = false;
    };
    prev();
  }

  TABS.theme = ['Theme & Colors', themeTab];
  const nb = document.createElement('button');
  nb.className = 'nv'; nb.dataset.t = 'theme'; nb.textContent = '🎨 Theme & Colors';
  nb.onclick = () => go('theme');
  const after = document.querySelector('#side .nv[data-t="sets"]');
  if (after) after.insertAdjacentElement('afterend', nb);
})();