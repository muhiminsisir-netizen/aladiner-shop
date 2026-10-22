'use strict';
/* admin-appearance.js : admin.html er shesh e (admin-theme.js er pore). Banner management + Appearance (hover glow, slider, service section). */
(() => {
  const SZ = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], WT = [[400, 'Regular'], [600, 'Semi-bold'], [700, 'Bold'], [800, 'Extra bold']], IMG = 'image/jpeg,image/png,image/webp';
  const opt = (a, c) => a.map(([v, l]) => `<option value="${v}" ${String(v) === String(c) ? 'selected' : ''}>${l}</option>`).join('');
  const big = f => f && f.size > 3 * 1024 * 1024;
  const css = document.createElement('style');
  css.textContent = '.bprev{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:16/6;min-height:120px;background:var(--grad);display:flex;flex-direction:column;padding:14px;color:#fff}.bprev:before{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.45),transparent 65%)}.bprev>*{position:relative}.bprev img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.gprev{width:190px;border-radius:16px;background:var(--sf);border:1px solid var(--bd);padding:10px;transition:box-shadow .3s}.gprev i{display:block;height:90px;border-radius:10px;background:var(--grad)}input[type=range]{padding:0}';
  document.head.appendChild(css);

  async function bnsTab() {
    const [L, A] = await Promise.all([api('/api/admin/banners'), api('/api/admin/appearance')]);
    const rows = L.map((b, i) => `<div class="bn"><img src="${esc(b.image)}" alt=""><div style="flex:1;min-width:0"><b>${esc(b.title) || '(no title)'}</b><br><small>${esc(b.subtitle)} ${esc(b.link)}</small></div>
      <span class="chip ${b.active ? 'c-on' : 'c-off'}">${b.active ? 'Live' : 'Hidden'}</span>
      <button class="btn gh sm" data-mv="up:${b.id}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn gh sm" data-mv="down:${b.id}" ${i < L.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
      <button class="btn gh sm" data-be="${b.id}">Edit</button><button class="btn gh sm" data-bt="${b.id}">${b.active ? 'Hide' : 'Show'}</button><button class="btn dg sm" data-bd="${b.id}">Delete</button></div>`).join('');
    $('#view').innerHTML = `<div class="box"><div class="row" style="justify-content:space-between"><b>Default banner</b><label class="row" style="gap:8px"><input type="checkbox" id="dshow" style="width:auto" ${A.default_show ? 'checked' : ''}><b>Show default banner</b></label></div>
     <p><small>Hide korle default banner kokhono dekhabe na (promo banner na thakleo). Sob hide thakle shudhu clean welcome heading dekhabe.</small></p><div class="g2">
      <label class="f">Show when<select id="dwhen"><option value="fallback">Only when no promo banner is live</option><option value="always">Always (as first slide)</option></select></label>
      <label class="f">Slide interval (seconds) <small>2 to 10</small><input id="dint" type="number" min="2" max="10" step="0.5" value="${A.interval}"></label>
      <label class="f">Title<input id="dtit" value="${esc(A.default_title)}" maxlength="100" placeholder="Store name"></label><label class="f">Subtitle<input id="dsub" value="${esc(A.default_subtitle)}" maxlength="200"></label>
      <label class="f">Button text<input id="dbtn" value="${esc(A.default_btn)}" maxlength="30"></label><label class="f">Button link<input id="dlnk" value="${esc(A.default_link)}"></label>
      <label class="f full">Image <small>optional · max 3MB</small><input id="dimg" type="file" accept="${IMG}"></label></div>
     ${A.default_image ? `<div class="row" style="margin-bottom:10px"><img class="th" src="${esc(A.default_image)}" alt=""><button class="btn gh sm" id="drm">Remove image</button></div>` : ''}
     <label class="row" style="gap:8px;margin:6px 0 12px"><input type="checkbox" id="dsvc" style="width:auto" ${A.svc_open ? 'checked' : ''}> Homepage service section (Delivery etc.) starts expanded</label>
     <button class="btn" id="dsave">Save</button> <span class="err" id="derr"></span></div>
     <div class="row" style="margin-bottom:12px"><b>Promo banners</b><span style="flex:1"></span><button class="btn" id="badd">+ Add banner</button></div>
     <div class="box" id="blist">${rows || '<p><small>No promo banners yet.</small></p>'}</div>`;
    $('#dwhen').value = A.default_when;
    $('#dsave').onclick = async () => {
      const er = $('#derr'), sb = $('#dsave'); er.textContent = ''; sb.disabled = true;
      try {
        const f = $('#dimg').files[0]; if (big(f)) throw new Error('Image must be under 3MB');
        await api('/api/admin/appearance', { method: 'POST', body: { default_show: $('#dshow').checked, default_when: $('#dwhen').value, interval: $('#dint').value, default_title: $('#dtit').value, default_subtitle: $('#dsub').value, default_btn: $('#dbtn').value, default_link: $('#dlnk').value, svc_open: $('#dsvc').checked } });
        if (f) { const fd = new FormData(); fd.append('image', f); await api('/api/admin/appearance/image', { method: 'POST', body: fd }); }
        toast('Saved'); go('bns');
      } catch (e) { er.textContent = e.message; sb.disabled = false; }
    };
    if ($('#drm')) $('#drm').onclick = async () => { try { await api('/api/admin/appearance/image', { method: 'DELETE' }); go('bns'); } catch (e) { toast(e.message, 'err'); } };
    $('#badd').onclick = () => bform(null);
    $('#blist').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.mv) { const [d, id] = b.dataset.mv.split(':'); await api(`/api/admin/banners/${id}/move`, { method: 'POST', body: { dir: d } }); go('bns'); }
        else if (b.dataset.be) bform(L.find(x => x.id == b.dataset.be));
        else if (b.dataset.bt) { await api(`/api/admin/banners/${b.dataset.bt}/toggle`, { method: 'POST' }); go('bns'); }
        else if (b.dataset.bd && confirm('Delete this banner permanently?')) { await api('/api/admin/banners/' + b.dataset.bd, { method: 'DELETE' }); toast('Banner deleted'); go('bns'); }
      } catch (er) { toast(er.message, 'err'); }
    };
  }

  function bform(b) {
    b = b || {}; const edit = !!b.id;
    modal(`<h2 style="margin-top:0">${edit ? 'Edit banner' : 'Add banner'}</h2><form id="bff" novalidate><div class="bprev" id="bpv"></div><div class="g2" style="margin-top:12px">
     <label class="f">Title<input name="title" value="${esc(b.title)}" maxlength="100"></label><label class="f">Subtitle<input name="subtitle" value="${esc(b.subtitle)}" maxlength="200"></label>
     <label class="f full">Description<textarea name="description" maxlength="400" style="min-height:60px">${esc(b.description)}</textarea></label>
     <label class="f">Button text <small>optional</small><input name="btn_text" value="${esc(b.btn_text)}" maxlength="30"></label><label class="f">Link<input name="link" value="${esc(b.link)}" placeholder="#/shop?deal=1"></label>
     <label class="f">Text color<input name="text_color" type="color" value="${esc(b.text_color || '#ffffff')}" style="height:42px;padding:3px"></label>
     <label class="f">Font size<select name="font_size">${opt(SZ, b.font_size || 'm')}</select></label><label class="f">Font weight<select name="font_weight">${opt(WT, b.font_weight || 700)}</select></label>
     <label class="f">Alignment<select name="align">${opt([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], b.align || 'left')}</select></label>
     <label class="f">Text position<select name="pos">${opt([['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']], b.pos || 'bottom')}</select></label>
     <label class="f">Image ${edit ? '<small>empty = keep current</small>' : '*'}<small>Recommended 1600 × 600 px (16:6). JPG/PNG/WebP, max 3 MB.</small><input name="image" type="file" accept="${IMG}"></label></div>
     <p class="err" id="bfe" role="alert"></p><div class="row" style="justify-content:flex-end"><button type="button" class="btn gh" id="bfc">Cancel</button><button class="btn">${edit ? 'Save changes' : 'Add banner'}</button></div></form>`);
    const f = $('#bff'), pv = $('#bpv'), E = n => f.elements[n], FZ = { s: '18px', m: '24px', l: '32px' }, JP = { top: 'flex-start', center: 'center', bottom: 'flex-end' }, JA = { left: 'flex-start', center: 'center', right: 'flex-end' };
    let src = b.image || '';
    const draw = () => {
      pv.style.justifyContent = JP[E('pos').value]; pv.style.alignItems = JA[E('align').value]; pv.style.textAlign = E('align').value; pv.style.color = E('text_color').value;
      pv.innerHTML = (src ? `<img src="${esc(src)}" alt="">` : '') + `<b style="font-size:${FZ[E('font_size').value]};font-weight:${E('font_weight').value}">${esc(E('title').value) || 'Banner title'}</b><span>${esc(E('subtitle').value)}</span>`;
    };
    f.addEventListener('input', draw);
    E('image').onchange = e => {
      const x = e.target.files[0]; if (big(x)) { e.target.value = ''; $('#bfe').textContent = 'Image must be under 3MB'; return; }
      $('#bfe').textContent = ''; if (src.startsWith('blob:')) URL.revokeObjectURL(src); src = x ? URL.createObjectURL(x) : (b.image || ''); draw();
    };
    $('#bfc').onclick = closeM;
    f.onsubmit = async e => {
      e.preventDefault(); const er = $('#bfe'); er.textContent = '';
      if (!edit && !E('image').files[0]) return er.textContent = 'Banner image is required';
      try { await api(edit ? '/api/admin/banners/' + b.id : '/api/admin/banners', { method: edit ? 'PUT' : 'POST', body: new FormData(f) }); closeM(); toast('Banner saved'); go('bns'); }
      catch (x) { er.textContent = x.message; }
    };
    draw();
  }

  async function lookTab() {
    const A = await api('/api/admin/appearance');
    $('#view').innerHTML = `<div class="two"><form class="box" id="gf" novalidate><b>Product card hover glow</b><p><small>Customer card er upor mouse nile product image er main color diye halka glow dekhabe. Image er color change hoy na. Phone e tap korle same feedback.</small></p>
     <label class="row" style="gap:8px;margin-bottom:12px"><input type="checkbox" name="glow" style="width:auto" ${A.glow ? 'checked' : ''}><b>Enable hover glow</b></label><div class="g2">
      <label class="f">Intensity (spread) <small id="o1">${A.glow_intensity}px</small><input type="range" name="glow_intensity" min="0" max="16" step="1" value="${A.glow_intensity}"></label>
      <label class="f">Blur <small id="o2">${A.glow_blur}px</small><input type="range" name="glow_blur" min="0" max="60" step="1" value="${A.glow_blur}"></label>
      <label class="f">Opacity <small id="o3">${Math.round(A.glow_opacity * 100)}%</small><input type="range" name="glow_opacity" min="0" max="1" step="0.05" value="${A.glow_opacity}"></label>
      <label class="f">Transition <small id="o4">${A.glow_dur}ms</small><input type="range" name="glow_dur" min="0" max="1000" step="50" value="${A.glow_dur}"></label>
      <label class="f">Fallback color <small>jodi image theke color na pay</small><input type="color" name="glow_color" value="${esc(A.glow_color)}" style="height:42px;padding:3px"></label></div>
     <button class="btn">Save appearance</button> <span class="err" id="ge"></span></form>
     <div class="box" style="align-self:start"><b>Preview</b><p><small>Card er upor mouse niye dekho (fallback color dekhabe).</small></p><div class="gprev" id="gp"><i></i><p style="margin:8px 0 0"><b>Sample product</b></p></div></div></div>`;
    const f = $('#gf'), g = $('#gp'), E = n => f.elements[n];
    const cur = () => ({ glow: E('glow').checked, glow_intensity: +E('glow_intensity').value, glow_blur: +E('glow_blur').value, glow_opacity: +E('glow_opacity').value, glow_dur: +E('glow_dur').value, glow_color: E('glow_color').value });
    const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
    f.oninput = () => { const c = cur(); $('#o1').textContent = c.glow_intensity + 'px'; $('#o2').textContent = c.glow_blur + 'px'; $('#o3').textContent = Math.round(c.glow_opacity * 100) + '%'; $('#o4').textContent = c.glow_dur + 'ms'; g.style.transition = `box-shadow ${c.glow_dur}ms`; };
    g.onmouseenter = () => { const c = cur(); if (c.glow) g.style.boxShadow = `0 10px ${c.glow_blur}px ${c.glow_intensity}px ${rgba(c.glow_color, c.glow_opacity)}`; };
    g.onmouseleave = () => g.style.boxShadow = '';
    f.onsubmit = async e => { e.preventDefault(); $('#ge').textContent = ''; try { await api('/api/admin/appearance', { method: 'POST', body: cur() }); toast('Appearance saved'); } catch (x) { $('#ge').textContent = x.message; } };
  }

  TABS.bns = ['Banners', bnsTab]; TABS.look = ['Appearance', lookTab];
  const nb = document.createElement('button'); nb.className = 'nv'; nb.dataset.t = 'look'; nb.textContent = '✨ Appearance'; nb.onclick = () => go('look');
  const after = document.querySelector('#side .nv[data-t="theme"]') || document.querySelector('#side .nv[data-t="sets"]'); if (after) after.insertAdjacentElement('afterend', nb);
})();
