'use strict';
/* admin-variants.js : Product form e Size/Variant editor + Description table editor */
(() => {
  const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
  const _pf = pform;
  pform = function (p) { _pf(p); extras(p || {}); };
  function extras(p) {
    const pe = document.getElementById('pe'), f = document.getElementById('pf'); if (!pe || !f) return;
    let on = !!p.has_variants, vs = (p.variants || []).map(v => ({ ...v })), tb = null;
    try { tb = p.desc_table ? JSON.parse(p.desc_table) : null; } catch { }
    pe.insertAdjacentHTML('beforebegin', `<div class="box" style="margin-top:10px"><label class="row" style="gap:8px"><input type="checkbox" id="von" style="width:auto" ${on ? 'checked' : ''}><b>This product has sizes / variants</b></label>
      <div id="vbox" ${on ? '' : 'hidden'}><small>Protita size er nijer SKU, stock ar (chaile) alada price thake. SKU khali rakhle auto hobe.</small>
      <div class="wrap"><table id="vt"></table></div><div class="row"><button type="button" class="btn gh sm" id="vadd">+ Add variant</button><button type="button" class="btn gh sm" id="vsz">+ S M L XL XXL</button></div></div></div>
      <div class="box"><div class="row" style="justify-content:space-between"><b>Size chart / table</b><span class="row"><button type="button" class="btn gh sm" id="tadd">${tb ? 'Edit table' : '+ Add table'}</button><button type="button" class="btn dg sm" id="trm" ${tb ? '' : 'hidden'}>Remove</button></span></div><div id="tbox" hidden></div></div>
      <input type="hidden" name="has_variants" value="${on ? 1 : 0}"><input type="hidden" name="variants" value="[]"><input type="hidden" name="desc_table" value="">`);
    const H = n => f.querySelector(`[name=${n}]`);
    const sync = () => {
      H('has_variants').value = on ? 1 : 0; H('variants').value = JSON.stringify(vs);
      H('desc_table').value = tb ? JSON.stringify(tb) : '';
      if (on) { f.stock.value = vs.filter(v => v.active !== 0).reduce((a, v) => a + (+v.stock || 0), 0); f.stock.readOnly = true; } else f.stock.readOnly = false;
    };
    const drawV = () => {
      $('#vt').innerHTML = '<tr><th>Name</th><th>SKU</th><th>Price ৳</th><th>Stock</th><th>Active</th><th></th></tr>' + vs.map((v, i) => `<tr>
       <td><input data-k="name" data-i="${i}" value="${esc(v.name)}" style="width:80px" placeholder="M"></td><td><input data-k="sku" data-i="${i}" value="${esc(v.sku || '')}" style="width:140px" placeholder="auto"></td>
       <td><input data-k="price" data-i="${i}" type="number" min="1" value="${v.price ?? ''}" style="width:90px" placeholder="base"></td><td><input data-k="stock" data-i="${i}" type="number" min="0" value="${v.stock ?? 0}" style="width:80px"></td>
       <td><input data-k="active" data-i="${i}" type="checkbox" style="width:auto" ${v.active === 0 ? '' : 'checked'}></td><td><button type="button" class="btn dg sm" data-vx="${i}">✕</button></td></tr>`).join('');
      $$('#vt [data-k]').forEach(el => el.oninput = el.onchange = () => { const v = vs[el.dataset.i]; v[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; sync(); });
      $$('[data-vx]').forEach(b => b.onclick = () => { vs.splice(+b.dataset.vx, 1); drawV(); sync(); });
      sync();
    };
    $('#von').onchange = e => { on = e.target.checked; $('#vbox').hidden = !on; if (on && !vs.length) { vs = [{ name: '', sku: '', price: '', stock: +f.stock.value || 0, active: 1 }]; drawV(); } sync(); };
    $('#vadd').onclick = () => { vs.push({ name: '', sku: '', price: '', stock: 0, active: 1 }); drawV(); };
    $('#vsz').onclick = () => { SIZES.filter(s => !vs.some(v => v.name.toLowerCase() === s.toLowerCase())).forEach(s => vs.push({ name: s, sku: '', price: '', stock: 0, active: 1 })); drawV(); };
    drawV();
    // ---- table editor ----
    const drawT = () => {
      const t = tb, box = $('#tbox'); box.hidden = false;
      box.innerHTML = `<label class="f">Title <small>optional (e.g. Size chart)</small><input id="ttl2" value="${esc(t.title || '')}" maxlength="80"></label><div class="wrap"><table>${t.rows.map((r, i) => `<tr>${r.map((c, j) => `<td><input data-r="${i}" data-c="${j}" value="${esc(c)}" style="min-width:80px${i ? '' : ';font-weight:700'}"></td>`).join('')}</tr>`).join('')}</table></div>
       <div class="row" style="margin-top:8px"><button type="button" class="btn gh sm" id="ar">+ Row</button><button type="button" class="btn gh sm" id="rr">− Row</button><button type="button" class="btn gh sm" id="ac">+ Column</button><button type="button" class="btn gh sm" id="rc">− Column</button></div><small>Prothom row heading hishebe dekhabe. Max 40 row, 12 column.</small>`;
      $$('#tbox [data-r]').forEach(el => el.oninput = () => { t.rows[el.dataset.r][el.dataset.c] = el.value; sync(); });
      $('#ttl2').oninput = e => { t.title = e.target.value; sync(); };
      $('#ar').onclick = () => { if (t.rows.length < 40) { t.rows.push(t.rows[0].map(() => '')); drawT(); sync(); } };
      $('#rr').onclick = () => { if (t.rows.length > 1) { t.rows.pop(); drawT(); sync(); } };
      $('#ac').onclick = () => { if (t.rows[0].length < 12) { t.rows.forEach(r => r.push('')); drawT(); sync(); } };
      $('#rc').onclick = () => { if (t.rows[0].length > 1) { t.rows.forEach(r => r.pop()); drawT(); sync(); } };
    };
    $('#tadd').onclick = () => { if (!tb) tb = { title: 'Size chart', rows: [['Size', 'Chest', 'Length'], ['S', '', ''], ['M', '', '']] }; $('#trm').hidden = false; $('#tadd').textContent = 'Edit table'; drawT(); sync(); };
    $('#trm').onclick = () => { if (!confirm('Remove this table?')) return; tb = null; $('#tbox').hidden = true; $('#trm').hidden = true; $('#tadd').textContent = '+ Add table'; sync(); };
    if (tb) { $('#tbox').hidden = true; sync(); }
  }
})();