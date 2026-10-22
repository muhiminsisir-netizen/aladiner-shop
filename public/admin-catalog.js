'use strict';
/* admin-catalog.js : admin.html er shesh e load hobe. Category Management + notun Product form. */
(() => {
  const LV = ['', 'Main category', 'Subcategory', 'Child category'];
  const NEXT = ['', 'Subcategory', 'Child category', ''];
  const css = document.createElement('style');
  css.textContent = '.crow:hover{background:var(--sf2)}.crow .th{width:36px;height:36px;border-radius:8px;object-fit:cover}.chk{display:flex;gap:8px;align-items:center;font-weight:600;font-size:13px;margin-bottom:10px}.chk input{width:auto;margin:0}';
  document.head.appendChild(css);

  // admin.html er api() error er status dey na, tai delete er jonno alada helper
  const raw = async (url, opt = {}) => {
    const r = await fetch(url, { method: opt.method || 'GET' });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  };

  // ================= Category Management =================
  async function catsTab() {
    const L = await api('/api/admin/categories');
    // Older servers or cached category responses may not include the derived level.
    const depthOf = c => { let depth = 1, p = c.parent_id && L.find(x => x.id == c.parent_id); while (p && depth < 3) { depth++; p = p.parent_id && L.find(x => x.id == p.parent_id); } return depth; };
    L.forEach(c => { if (![1, 2, 3].includes(+c.level)) c.level = depthOf(c); else c.level = +c.level; });
    const byId = Object.fromEntries(L.map(c => [c.id, c]));
    const kids = {}; L.forEach(c => (kids[c.parent_id || 0] = kids[c.parent_id || 0] || []).push(c));
    const label = id => { const o = []; let c = byId[id]; while (c) { o.unshift(c.name); c = byId[c.parent_id]; } return o.join(' › '); };
    const sub = id => { const o = [id]; for (let i = 0; i < o.length; i++) (kids[o[i]] || []).forEach(k => o.push(k.id)); return o; };
    const V = document.getElementById('view');
    V.innerHTML = `<div class="row" style="margin-bottom:14px;flex-wrap:wrap"><input id="cq" placeholder="Search categories…" style="max-width:320px"><span style="flex:1"></span><button class="btn gh" id="caddsub">+ Add subcategory</button><button class="btn gh" id="caddchild">+ Add child category</button><button class="btn" id="cadd">+ Add main category</button></div>
      <div class="box" id="ctree" style="padding:6px 12px"></div>`;

    const row = c => `<div class="crow" style="display:flex;align-items:center;gap:10px;padding:10px 6px 10px ${6 + (c.level - 1) * 28}px;border-top:1px solid var(--bd);flex-wrap:wrap">
      ${c.image ? `<img class="th" src="${esc(c.image)}" alt="">` : ''}
      <div style="flex:1;min-width:170px"><b>${esc(c.name)}</b> <small>${LV[c.level]} · ${c.products} product${c.products === 1 ? '' : 's'}</small><br>
       ${!c.active ? '<span class="chip c-off">Hidden</span> ' : ''}${c.active && c.level === 1 && !c.show_menu ? '<span class="chip">Not in menu</span> ' : ''}${c.active && c.level === 1 && !c.show_home ? '<span class="chip">Not on homepage</span>' : ''}</div>
      <div class="row" style="gap:6px">${c.level < 3 ? `<button class="btn gh sm" data-cadd="${c.id}">+ ${NEXT[c.level]}</button>` : ''}
       <button class="btn gh sm" data-cmv="up:${c.id}" aria-label="Move up">↑</button><button class="btn gh sm" data-cmv="down:${c.id}" aria-label="Move down">↓</button>
       <button class="btn gh sm" data-cedit="${c.id}">Edit</button><button class="btn dg sm" data-cdel="${c.id}">Delete</button></div></div>`;
    const draw = () => {
      const q = document.getElementById('cq').value.trim().toLowerCase(); let vis = null;
      if (q) {
        vis = new Set();
        L.filter(c => c.name.toLowerCase().includes(q)).forEach(c => {
          sub(c.id).forEach(i => vis.add(i)); let p = byId[c.parent_id]; while (p) { vis.add(p.id); p = byId[p.parent_id]; }
        });
      }
      const walk = pid => (kids[pid] || []).filter(c => !vis || vis.has(c.id)).map(c => row(c) + walk(c.id)).join('');
      document.getElementById('ctree').innerHTML = walk(0) || `<p style="padding:20px;text-align:center"><small>${L.length ? 'No categories match your search.' : 'No categories yet. Click “Add main category” to create your first one.'}</small></p>`;
    };
    document.getElementById('cq').oninput = draw; draw();
    document.getElementById('cadd').onclick = () => cform(null, null);
    const chooseParent = level => {
      const parents = L.filter(c => c.level === level);
      if (!parents.length) return toast(level === 1 ? 'Add a main category first' : 'Add a subcategory first', 'err');
      const title = level === 1 ? 'Choose a main category' : 'Choose a subcategory';
      modal(`<h2 style="margin-top:0">Add ${level === 1 ? 'subcategory' : 'child category'}</h2><p><small>${title} as the parent:</small></p><select id="cparent" style="width:100%;margin-bottom:14px">${parents.map(c => `<option value="${c.id}">${esc(label(c.id))}</option>`).join('')}</select><div class="row" style="justify-content:flex-end"><button type="button" class="btn gh" id="cpcancel">Cancel</button><button type="button" class="btn" id="cpnext">Continue</button></div>`);
      document.getElementById('cpcancel').onclick = closeM;
      document.getElementById('cpnext').onclick = () => { const parent = byId[document.getElementById('cparent').value]; closeM(); if (parent) cform(parent, null); };
    };
    document.getElementById('caddsub').onclick = () => chooseParent(1);
    document.getElementById('caddchild').onclick = () => chooseParent(2);
    document.getElementById('ctree').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cadd) return cform(byId[b.dataset.cadd], null);
      if (b.dataset.cedit) return cform(byId[byId[b.dataset.cedit].parent_id] || null, byId[b.dataset.cedit]);
      if (b.dataset.cmv) { const [dir, id] = b.dataset.cmv.split(':'); try { await api(`/api/admin/categories/${id}/move`, { method: 'POST', body: { dir } }); go('cats'); } catch (er) { toast(er.message, 'err'); } return; }
      if (b.dataset.cdel) return del(byId[b.dataset.cdel]);
    };

    function cform(parent, c) {
      c = c || {};
      const title = c.id ? 'Edit ' + LV[c.level || 1].toLowerCase() : 'Add ' + (parent ? NEXT[parent.level].toLowerCase() : 'main category');
      const main = (c.id ? c.level : parent ? parent.level + 1 : 1) === 1;
      modal(`<h2 style="margin-top:0">${esc(title)}</h2>${parent ? `<p><small>Parent: <b>${esc(label(parent.id))}</b></small></p>` : ''}
        <form id="cff" novalidate><div class="g2">
         <label class="f full">Name *<input name="name" value="${esc(c.name)}" maxlength="80"></label>
         <label class="f">URL slug <small>optional</small><input name="slug" value="${esc(c.slug)}" maxlength="80"></label>
         <label class="f">Image <small>optional · max 3MB</small><input name="image" type="file" accept="image/jpeg,image/png,image/webp"></label>
         ${c.image ? `<label class="chk full"><input type="checkbox" id="rmimg"> Remove current image</label>` : ''}
         <label class="f full">Description <small>optional</small><textarea name="description" maxlength="500">${esc(c.description)}</textarea></label>
         <div class="full"><label class="chk"><input type="checkbox" id="ca" ${c.id && !c.active ? '' : 'checked'}> Visible to customers</label>
          ${main ? `<label class="chk"><input type="checkbox" id="cm" ${c.id && !c.show_menu ? '' : 'checked'}> Show in navigation menu</label><label class="chk"><input type="checkbox" id="ch" ${c.id && !c.show_home ? '' : 'checked'}> Show on homepage</label>` : ''}</div></div>
         <p class="err" id="ce" role="alert"></p><div class="row" style="justify-content:flex-end"><button type="button" class="btn gh" id="cc">Cancel</button><button class="btn" id="cs">${c.id ? 'Save changes' : 'Create'}</button></div></form>`);
      document.getElementById('cc').onclick = closeM;
      document.getElementById('cff').onsubmit = async e => {
        e.preventDefault(); const f = e.target, er = document.getElementById('ce'); er.textContent = '';
        if (!f.name.value.trim()) return er.textContent = 'Category name is required';
        const fd = new FormData(); ['name', 'slug', 'description'].forEach(k => fd.append(k, f[k].value));
        if (f.image.files[0]) { if (f.image.files[0].size > 3 * 1024 * 1024) return er.textContent = 'Image must be under 3MB'; fd.append('image', f.image.files[0]); }
        if (parent) fd.append('parent_id', parent.id);
        fd.append('active', document.getElementById('ca').checked ? '1' : '0');
        if (main) { fd.append('show_menu', document.getElementById('cm').checked ? '1' : '0'); fd.append('show_home', document.getElementById('ch').checked ? '1' : '0'); }
        if (document.getElementById('rmimg') && document.getElementById('rmimg').checked) fd.append('remove_image', '1');
        const sb = document.getElementById('cs'); sb.disabled = true;
        try { await api(c.id ? '/api/admin/categories/' + c.id : '/api/admin/categories', { method: c.id ? 'PUT' : 'POST', body: fd }); closeM(); toast('Category saved'); go('cats'); }
        catch (x) { er.textContent = x.message; sb.disabled = false; }
      };
    }

    async function del(c) {
      const ids = sub(c.id), extra = ids.length - 1;
      if (c.products === 0) {
        if (!confirm(`Delete "${c.name}"${extra ? ` and its ${extra} sub-categor${extra === 1 ? 'y' : 'ies'}` : ''}? This cannot be undone.`)) return;
        const r = await raw('/api/admin/categories/' + c.id, { method: 'DELETE' });
        if (r.status === 409) return go('cats');
        return r.ok ? (toast('Category deleted'), go('cats')) : toast(r.data.error || 'Delete failed', 'err');
      }
      const opts = L.filter(x => !ids.includes(x.id)).map(x => `<option value="${x.id}">${esc(label(x.id))}</option>`).join('');
      modal(`<h2 style="margin-top:0">Delete “${esc(c.name)}”</h2>
        <p><b>${c.products}</b> product${c.products === 1 ? ' uses' : 's use'} this category${extra ? ` (including its ${extra} sub-categor${extra === 1 ? 'y' : 'ies'}, which will also be deleted)` : ''}. Choose what happens to the products:</p>
        ${c.parent_id ? `<label class="chk"><input type="radio" name="rd" value="parent" checked style="width:auto"> Keep them in “${esc(label(c.parent_id))}”</label>` : ''}
        <label class="chk"><input type="radio" name="rd" value="move" ${c.parent_id ? '' : 'checked'} style="width:auto"> Move them to:</label>
        <select id="rdsel" style="margin:0 0 10px 24px;width:calc(100% - 24px)">${opts || '<option value="">No other category</option>'}</select>
        <label class="chk"><input type="radio" name="rd" value="none" style="width:auto"> Leave them uncategorized</label>
        <p class="err" id="de" role="alert"></p><div class="row" style="justify-content:flex-end"><button class="btn gh" id="dc">Cancel</button><button class="btn dg" id="dok">Delete category</button></div>`);
      document.getElementById('dc').onclick = closeM;
      document.getElementById('dok').onclick = async () => {
        const v = document.querySelector('input[name=rd]:checked').value, de = document.getElementById('de'); de.textContent = '';
        const re = v === 'move' ? document.getElementById('rdsel').value : v;
        if (!re) return de.textContent = 'Choose a category to move the products to';
        const r = await raw(`/api/admin/categories/${c.id}?reassign_to=${encodeURIComponent(re)}`, { method: 'DELETE' });
        if (r.ok) { closeM(); toast('Category deleted'); go('cats'); } else de.textContent = r.data.error || 'Delete failed';
      };
    }
  }

  // ================= Add / Edit product form (dynamic category + SKU) =================
  pform = function (p) {
    p = p || {};
    modal(`<h2 style="margin-top:0">${p.id ? 'Edit product' : 'Add product'}</h2><form id="pf" novalidate><div class="g2">
     <label class="f full">Name *<input name="name" value="${esc(p.name)}" maxlength="200"></label>
     <div class="full"><div class="g2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <label class="f">Main category<select name="cat_id" id="pc1"><option value="">Loading…</option></select></label>
      <label class="f">Subcategory<select name="sub_id" id="pc2" disabled></select></label>
      <label class="f">Child category<select name="child_id" id="pc3" disabled></select></label></div>
      <small id="pch"></small></div>
     <label class="f">Brand<input name="brand" value="${esc(p.brand)}"></label>
     <label class="f">SKU <small>khali rakhle auto toiri hobe</small><span class="row" style="flex-wrap:nowrap;margin-top:5px"><input name="sku" value="${esc(p.sku)}" maxlength="60" style="margin:0"><button type="button" class="btn gh sm" id="pskug">Auto</button></span></label>
     <label class="f">Stock *<input name="stock" type="number" min="0" step="1" value="${p.stock ?? ''}"></label>
     <label class="f">Selling price (৳) *<input name="price" type="number" min="1" step="0.01" value="${p.price ?? ''}"></label>
     <label class="f">Original price (৳) <small>optional, shows discount</small><input name="old_price" type="number" min="0" step="0.01" value="${p.old_price ?? ''}"></label>
     <label class="f full">Description<textarea name="description">${esc(p.description)}</textarea></label>
     <div class="full"><label class="f">Images <small>up to 6 · JPG/PNG/WebP · max 3MB each · first image is the main image${p.id ? ' · uploading new images replaces old ones' : ''}</small><input id="imf" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
      <div class="prev" id="pv">${(p.gallery || []).map(s => `<img src="${esc(s)}" alt="">`).join('')}</div></div></div>
     <p class="err" id="pe" role="alert"></p><div class="row" style="justify-content:flex-end"><button type="button" class="btn gh" id="pc">Cancel</button><button class="btn" id="ps2">${p.id ? 'Save changes' : 'Create product'}</button></div></form>`);
  const $e = id => document.getElementById(id);
    $e('pc').onclick = closeM;

    // categories database theke (hardcoded na). Parent bodlale child reset hoy.
    api('/api/admin/categories').then(L => {
      const kidsOf = (pid, keep) => pid ? L.filter(c => c.parent_id === pid && (c.active || c.id === keep)) : [];
      const fill = (sel, items, cur, none) => {
        sel.innerHTML = `<option value="">${items.length ? none : 'None available'}</option>` + items.map(c => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}${c.active ? '' : ' (hidden)'}</option>`).join('');
        sel.disabled = !items.length;
      };
      const mains = L.filter(c => !c.parent_id && (c.active || c.id === p.cat_id));
      fill($e('pc1'), mains, p.cat_id || null, '— No category —');
      fill($e('pc2'), kidsOf(p.cat_id, p.sub_id), p.sub_id || null, '— None —');
      fill($e('pc3'), kidsOf(p.sub_id, p.child_id), p.child_id || null, '— None —');
      if (!L.length) $e('pch').textContent = 'Kono category nei. Age sidebar er “Categories” theke category banao.';
      $e('pc1').onchange = e => { fill($e('pc2'), kidsOf(+e.target.value || 0), null, '— None —'); fill($e('pc3'), [], null, '— None —'); };
      $e('pc2').onchange = e => fill($e('pc3'), kidsOf(+e.target.value || 0), null, '— None —');
    }).catch(er => { $e('pc1').innerHTML = '<option value="">Could not load categories</option>'; $e('pch').textContent = er.message; });

    $e('pskug').onclick = async () => {
      const n = $e('pf').name.value.trim(); if (!n) return $e('pe').textContent = 'Age product er naam likho';
      try { $e('pf').sku.value = (await api('/api/admin/sku-suggest?name=' + encodeURIComponent(n))).sku; $e('pe').textContent = ''; } catch (er) { $e('pe').textContent = er.message; }
    };
    $e('imf').onchange = e => {
      const fs = [...e.target.files];
      if (fs.length > 6) { e.target.value = ''; $e('pv').innerHTML = ''; return $e('pe').textContent = 'Maximum 6 images allowed'; }
      if (fs.some(f => f.size > 3 * 1024 * 1024)) { e.target.value = ''; $e('pv').innerHTML = ''; return $e('pe').textContent = 'Each image must be under 3MB'; }
      $e('pe').textContent = ''; $e('pv').innerHTML = fs.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
    };
    $e('pf').onsubmit = async e => {
      e.preventDefault(); const f = e.target, er = $e('pe');
      if (!f.name.value.trim()) return er.textContent = 'Product name is required';
      if (!(+f.price.value > 0)) return er.textContent = 'Enter a valid selling price';
      if (!(f.stock.value !== '' && +f.stock.value >= 0)) return er.textContent = 'Enter a valid stock quantity';
      if (f.old_price.value && +f.old_price.value <= +f.price.value) return er.textContent = 'Original price must be higher than the selling price (or leave empty)';
      er.textContent = ''; $e('ps2').disabled = true; $e('ps2').textContent = 'Saving…';
      try { await api(p.id ? '/api/admin/products/' + p.id : '/api/admin/products', { method: p.id ? 'PUT' : 'POST', body: new FormData(f) }); closeM(); toast('Product saved'); prods(); }
      catch (x) { er.textContent = x.message; $e('ps2').disabled = false; $e('ps2').textContent = p.id ? 'Save changes' : 'Create product'; }
    };
  };

  // ================= sidebar e "Categories" =================
  TABS.cats = ['Category Management', catsTab];
  const nb = document.createElement('button');
  nb.className = 'nv'; nb.dataset.t = 'cats'; nb.textContent = '🗂️ Categories';
  nb.onclick = () => go('cats');
  const after = document.querySelector('#side .nv[data-t="prods"]');
  if (after) after.insertAdjacentElement('afterend', nb);
})();
