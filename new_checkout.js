async function checkout() {
  const t = routeId; let items = JSON.parse(sessionStorage.getItem('buynow') || 'null') || cart;
  if (!items.length) { location.hash = '#/cart'; return }
  const sv = store.get('addr', {});
  const co = { name: sv.name || (me && me.name) || '', phone: sv.phone || (me && me.phone) || '', area: sv.area || 'dhaka', address: sv.address || '', note: '', coupon: '', pay: 'cod', trx: '' };
  let d = null, busy = false; const idem = uid();
  app.innerHTML = '<div class="skb tall"></div>';
  const refresh = async () => { d = await api('/api/cart/preview', { method: 'POST', body: { items, area: co.area, coupon: co.coupon } }); if (d.couponError) { toast(d.couponError, 'err'); co.coupon = '' } };
  await refresh(); if (t !== routeId) return;
  if (!d.lines.length) return app.innerHTML = empty('😕', 'Items unavailable', 'The products in your order are no longer available.', '<a class="btn" href="#/shop">Continue shopping</a>');
  const methods = [['cod', '💵', 'Cash on Delivery']];
  if (cfg.bkash) methods.push(['bkash', '📱', 'bKash', cfg.bkash]);
  if (cfg.nagad) methods.push(['nagad', '📱', 'Nagad', cfg.nagad]);
  const read = () => {
    const f = $('#cf'); if (!f) return; const g = n => f.elements[n];
    co.name = g('name').value; co.phone = g('phone').value.replace(/[\s-]/g, ''); co.area = g('area').value;
    co.address = g('address').value; co.note = g('note').value; if (g('trx')) co.trx = g('trx').value.trim().toUpperCase();
  };
  const validate = () => {
    const e = {}; if (!co.name.trim()) e.name = 'Enter your full name';
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(co.phone)) e.phone = 'Enter a valid BD mobile number (01XXXXXXXXX)';
    if (co.address.trim().length < 10) e.address = 'Enter your full address (area, thana, district)';
    if (co.pay !== 'cod' && !/^[A-Z0-9]{6,16}$/.test(co.trx)) e.trx = 'Enter the Transaction ID (6-16 letters/numbers)';
    return e;
  };
  const draw = () => {
    const m = methods.find(x => x[0] === co.pay) || methods[0];
    app.innerHTML = `<h1 class="pt">Checkout</h1>
    <div class="trust"><span>🔒 Secure checkout</span><span>💵 Cash on Delivery</span><span>↩ Easy return</span><span>🚚 Dhaka ${tk(cfg.ship_dhaka)} · Outside ${tk(cfg.ship_outside)}</span></div>
    <div class="cow"><form id="cf" novalidate>
     <div class="box"><h3>1. Delivery details</h3><p><small>No account needed. Just tell us where to deliver.</small></p><div class="form2">
      <label class="fld">Full name<input name="name" value="${esc(co.name)}" autocomplete="name"><em data-e="name"></em></label>
      <label class="fld">Mobile number<input name="phone" value="${esc(co.phone)}" inputmode="tel" autocomplete="tel" placeholder="01XXXXXXXXX"><em data-e="phone"></em></label>
      <label class="fld full">Delivery area<select name="area"><option value="dhaka" ${co.area === 'dhaka' ? 'selected' : ''}>Inside Dhaka</option><option value="outside" ${co.area === 'outside' ? 'selected' : ''}>Outside Dhaka</option></select></label>
      <label class="fld full">Full address<textarea name="address" placeholder="House, road, area, thana, district" autocomplete="street-address">${esc(co.address)}</textarea><em data-e="address"></em></label>
      <label class="fld full">Delivery note (optional)<input name="note" value="${esc(co.note)}" maxlength="300"></label></div></div>
     <div class="box"><h3>2. Payment</h3><div class="pays">${methods.map(x => `<label class="pay ${co.pay === x[0] ? 'on' : ''}"><input type="radio" name="pay" value="${x[0]}" ${co.pay === x[0] ? 'checked' : ''}><span>${x[1]}</span><b>${x[2]}</b></label>`).join('')}</div>
      ${co.pay === 'cod' ? '<p class="payinfo">Pay in cash when your order arrives. No advance needed.</p>' : `<div class="payinfo"><p>Send <b>${tk(d.total)}</b> via ${esc(m[2])} (Send Money) to:</p><div class="row"><b class="pn">${esc(m[3])}</b><button type="button" class="btn ghost sm" id="cpy">Copy</button></div><p><small>${esc(cfg.pay_note || '')}</small></p><label class="fld">Transaction ID<input name="trx" value="${esc(co.trx)}" maxlength="16" style="text-transform:uppercase" placeholder="e.g. 9AB3CD45EF"><em data-e="trx"></em></label></div>`}</div>
     <div class="box"><h3>Coupon</h3><div class="row" style="flex-wrap:nowrap"><input id="cp" placeholder="Enter code" value="${esc(co.coupon)}" style="text-transform:uppercase"><button type="button" class="btn ghost" id="cpa">Apply</button></div>${d.coupon ? `<p class="okt">Coupon ${esc(d.coupon)} applied: -${tk(d.discount)}</p>` : ''}</div></form>
     <aside class="box sum"><h3>Order summary</h3>${d.lines.map(l => `<div class="sl"><span>${esc(l.name)} × ${l.qty}</span><b>${tk(l.price * l.qty)}</b></div>`).join('')}<hr>
      <div class="sl"><span>Subtotal</span><b>${tk(d.subtotal)}</b></div>${d.discount ? `<div class="sl ok"><span>Discount (${esc(d.coupon)})</span><b>-${tk(d.discount)}</b></div>` : ''}
      <div class="sl"><span>Delivery</span><b>${d.shipping ? tk(d.shipping) : 'Free'}</b></div><div class="sl tot"><span>Total</span><b>${tk(d.total)}</b></div>
      <button class="btn block" id="po" style="margin-top:14px">Confirm order · ${tk(d.total)}</button><p class="sec-note">🔒 Your details are safe. You will get an order ID to track delivery.</p></aside></div>`;
    const f = $('#cf'); f.onsubmit = e => e.preventDefault();
    $$('input[name=pay]', f).forEach(r => r.onchange = () => { read(); co.pay = r.value; draw() });
    f.elements.area.onchange = async () => { read(); try { await refresh() } catch (er) { toast(er.message, 'err') } draw() };
    $('#cpa').onclick = async () => { read(); co.coupon = $('#cp').value.trim().toUpperCase(); try { await refresh(); if (d.coupon) toast('Coupon applied') } catch (e) { toast(e.message, 'err') } draw() };
    if ($('#cpy')) $('#cpy').onclick = async () => { try { await navigator.clipboard.writeText(m[3]); toast('Number copied') } catch { toast('Copy failed. Select the number manually.', 'err') } };
    $('#po').onclick = async () => {
      if (busy) return; read(); const er = validate(); $$('[data-e]').forEach(x => x.textContent = er[x.dataset.e] || '');
      const k = Object.keys(er)[0]; if (k) { toast(er[k], 'err'); const el = f.elements[k]; if (el) el.focus(); return }
      busy = true; const b = $('#po'); b.disabled = true; b.textContent = 'Placing order…';
      try {
        const r = await api('/api/orders', { method: 'POST', body: { items, name: co.name, phone: co.phone, address: co.address, area: co.area, note: co.note, coupon: co.coupon, pay: co.pay, trx: co.trx, idem } });
        store.set('addr', { name: co.name, phone: co.phone, area: co.area, address: co.address });
        if (sessionStorage.getItem('buynow')) sessionStorage.removeItem('buynow'); else { cart = []; saveCart() }
        location.hash = '#/order/' + r.id + '?new=1';
      } catch (e) {
        busy = false; toast(e.message, 'err');
        try { await refresh() } catch { }
        if (!d.lines.length) { location.hash = '#/cart'; return }
        items.splice(0, items.length, ...d.lines.map(l => ({ id: l.id, qty: l.qty }))); if (items === cart) saveCart();
        draw();
      }
    };
  };
  draw();
}