'use strict';
/* variants-ui.js : store e size selector, size chart, variant-aware cart. extra.js er pore load hobe. */
(() => {
  const pidOf = () => { const [pg, id] = location.hash.slice(2).split('?')[0].split('/'); return pg === 'product' ? +id : 0; };
  let sel = null;
  // card er quick-add: size lagle product page e pathao
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-add]'); if (!a) return;
    const p = PC[a.dataset.add]; if (p && p.has_variants) { e.preventDefault(); e.stopImmediatePropagation(); toast('Please choose a size'); location.hash = '#/product/' + p.id; }
  }, true);
  // Add to cart / Buy now (size soho)
  document.addEventListener('click', e => {
    const b = e.target.closest('#ad,#bn'); if (!b) return;
    const p = PC[pidOf()]; if (!p || !p.has_variants) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const v = (p.variants || []).find(x => x.id === sel);
    if (!v) { toast('Please select a size', 'err'); const s = document.querySelector('.sizes'); if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); } return; }
    const q = Math.max(1, Math.min(+$('#qv').textContent || 1, v.stock));
    if (b.id === 'bn') { sessionStorage.setItem('buynow', JSON.stringify([{ id: p.id, qty: q, v: v.id }])); location.hash = '#/checkout'; return; }
    const c = cart.find(x => x.id == p.id && x.v == v.id);
    if (c && c.qty >= v.stock) return toast('Maximum available quantity is already in your cart', 'err');
    if (c) c.qty = Math.min(c.qty + q, v.stock); else cart.push({ id: p.id, v: v.id, qty: q });
    saveCart(); toast('Added to cart', 'ok', ['#/cart', 'View cart']);
  }, true);

  function pdp() {
    const id = pidOf(), p = PC[id], box = document.querySelector('.pinfo');
    if (!id || !p || !box || box.dataset.v) return; box.dataset.v = 1; sel = null;
    const desc = box.querySelector('.desc'); let tb = null;
    try { tb = p.desc_table ? JSON.parse(p.desc_table) : null; } catch { }
    if (tb && tb.rows && tb.rows.length && desc) desc.insertAdjacentHTML('afterend', `<div class="sizechart">${tb.title ? `<h3>${esc(tb.title)}</h3>` : ''}<div class="tw"><table><thead><tr>${tb.rows[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${tb.rows.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
    const vs = p.variants || []; if (!p.has_variants || !vs.length) return;
    const stockEl = box.querySelector('.stock'), big = box.querySelector('.big');
    stockEl.insertAdjacentHTML('afterend', `<div class="vsel"><b>Size</b> <small id="vsm">Select a size</small><div class="sizes" role="radiogroup" aria-label="Size">${vs.map(v => `<button type="button" role="radio" aria-checked="false" class="size" data-vid="${v.id}" ${v.stock < 1 ? 'disabled' : ''}>${esc(v.name)}</button>`).join('')}</div></div>`);
    box.querySelectorAll('.size').forEach(b => b.onclick = () => {
      const v = vs.find(x => x.id == b.dataset.vid); sel = v.id;
      box.querySelectorAll('.size').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      const price = v.price ?? p.price; if (big.firstChild) big.firstChild.textContent = tk(price) + ' ';
      stockEl.className = 'stock ' + (v.stock <= 5 ? 'low' : 'ok'); stockEl.textContent = v.stock <= 5 ? `Only ${v.stock} left` : 'In stock';
      $('#vsm').textContent = `${v.name} selected`; const q = $('#qv'); if (q && +q.textContent > v.stock) q.textContent = v.stock;
    });
  }
  new MutationObserver(pdp).observe(document.getElementById('app'), { childList: true, subtree: true });

  // cart page: same product er alada size alada line
  cartPage = async function (first = true) {
    const t = routeId; sessionStorage.removeItem('buynow');
    if (!cart.length) return app.innerHTML = empty('🛒', 'Your cart is empty', 'Looks like you haven’t added anything yet.', '<a class="btn" href="#/shop">Start shopping</a>');
    if (first) app.innerHTML = '<div class="skb tall"></div>';
    const d = await api('/api/cart/preview', { method: 'POST', body: { items: cart, area: 'dhaka' } });
    if (t !== routeId) return;
    if (d.lines.length !== cart.length) toast('Some items are unavailable and were removed', 'err');
    cart = d.lines.map(l => ({ id: l.id, qty: l.qty, v: l.v })); saveCart();
    if (!d.lines.length) return app.innerHTML = empty('🛒', 'Your cart is empty', 'The items in your cart are no longer available.', '<a class="btn" href="#/shop">Continue shopping</a>');
    const fs = +cfg.free_ship, key = l => l.id + ':' + (l.v || 0);
    app.innerHTML = `<h1 class="pt">Shopping cart</h1><div class="cartw"><div class="box">
     ${fs > 0 ? `<div><small>${d.subtotal >= fs ? '🎉 You get free delivery!' : `Add ${tk(fs - d.subtotal)} more for free delivery`}</small><div class="prog"><i style="width:${Math.min(100, d.subtotal / fs * 100)}%"></i></div></div>` : ''}
     ${d.lines.map(l => `<div class="cl"><a class="th2" href="#/product/${l.id}">${l.image ? `<img src="${esc(l.image)}" alt="">` : '<span class="noimg">🛍️</span>'}</a>
      <div class="g"><a href="#/product/${l.id}">${esc(l.name)}</a><small>${tk(l.price)}${l.stock <= 5 ? ` · only ${l.stock} left` : ''}</small><div class="qty" style="margin-top:6px"><button data-d="-1" data-k="${key(l)}" aria-label="Decrease">${ic('minus')}</button><b>${l.qty}</b><button data-d="1" data-k="${key(l)}" aria-label="Increase">${ic('plus')}</button></div></div>
      <b>${tk(l.price * l.qty)}</b><button class="rm" data-rm="${key(l)}" aria-label="Remove item">${ic('trash')}</button></div>`).join('')}
     <div class="row" style="margin-top:10px"><button class="btn ghost sm" id="clr">Clear cart</button></div></div>
     <aside class="box sum"><h3>Order summary</h3><div class="sl"><span>Subtotal</span><b>${tk(d.subtotal)}</b></div><div class="sl"><small>Delivery charge is calculated at checkout</small></div>
     <div class="row" style="margin-top:14px"><a class="btn block" href="#/checkout">Proceed to Checkout</a><a class="btn ghost block" href="#/shop">Continue Shopping</a></div></aside></div>`;
    $$('[data-d]').forEach(b => b.onclick = () => {
      const c = cart.find(x => key(x) === b.dataset.k), l = d.lines.find(x => key(x) === b.dataset.k); if (!c) return;
      if (+b.dataset.d > 0 && c.qty >= l.stock) return toast('Only ' + l.stock + ' available', 'err');
      c.qty = Math.max(1, Math.min(l.stock, c.qty + +b.dataset.d)); saveCart(); cartPage(false);
    });
    $$('[data-rm]').forEach(b => b.onclick = () => { cart = cart.filter(x => key(x) !== b.dataset.rm); saveCart(); cartPage(false); });
    $('#clr').onclick = () => { if (confirm('Remove all items from your cart?')) { cart = []; saveCart(); cartPage(false); } };
  };
})();