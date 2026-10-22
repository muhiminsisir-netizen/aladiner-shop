function trackPage() {
  app.innerHTML = `<form class="box auth" id="tf" novalidate><h2>Track your order</h2><p><small>Enter your order ID and the phone number used at checkout.</small></p>
   <label class="fld">Order ID<input name="id" placeholder="ORD-XXXXXXXX" autocapitalize="characters"></label>
   <label class="fld">Phone<input name="phone" inputmode="tel" placeholder="01XXXXXXXXX"></label>
   <button class="btn block" id="tb">Track</button><p class="err" id="te" role="alert"></p></form>`;
  $('#tf').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('#tb'); b.disabled = true; $('#te').textContent = '';
    try { const r = await api('/api/orders/track', { method: 'POST', body: { id: f.elements.id.value, phone: f.elements.phone.value } }); location.hash = '#/order/' + r.id }
    catch (er) { $('#te').textContent = er.message; b.disabled = false }
  };
}