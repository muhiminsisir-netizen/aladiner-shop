'use strict';
/* Payment method controls for the admin sidebar. */
(() => {
  const methods = [
    ['bkash', 'bKash', 'bKash personal/merchant receiving number'],
    ['nagad', 'Nagad', 'Nagad receiving number'],
    ['rocket', 'Rocket', 'Rocket receiving number']
  ];
  const mark = key => `<span class="paymark ${key}" aria-hidden="true">${key === 'rocket' ? '↗' : key === 'bkash' ? 'b' : 'N'}</span>`;
  const css = document.createElement('style');
  css.textContent = '.pay-admin-grid{display:grid;gap:12px}.pay-admin-card{padding:16px;border:1px solid var(--bd);border-radius:16px;background:var(--sf);display:grid;grid-template-columns:1fr minmax(220px,340px);gap:12px;align-items:center}.pay-admin-card .pay-head{display:flex;align-items:center;gap:12px}.pay-admin-card label{margin:0}.paymark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-weight:900;font-size:23px;color:#fff;box-shadow:0 7px 16px #0002}.paymark.bkash{background:#e2136e}.paymark.nagad{background:#f58220}.paymark.rocket{background:#8c3494}.pay-admin-card small{display:block;color:var(--muted)}@media(max-width:650px){.pay-admin-card{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  async function payments() {
    const s = await api('/api/settings');
    $('#view').innerHTML = `<div class="box"><h2 style="margin-top:0">Checkout payment methods</h2><p><small>Cash on Delivery is always available. Turn each wallet on, add its receiving number, then save. Online payments use manual Send Money and Transaction ID verification.</small></p>
      <form id="payform" novalidate><div class="pay-admin-grid">${methods.map(([key, label, hint]) => {
        const enabled = s[key + '_enabled'] === '1' || (!s[key + '_enabled'] && !!s[key]);
        return `<section class="pay-admin-card"><div class="pay-head">${mark(key)}<div><b>${label}</b><small>${hint}</small><label class="chk" style="margin-top:8px"><input type="checkbox" name="${key}_enabled" ${enabled ? 'checked' : ''}> Show at checkout</label></div></div>
          <label class="f">${label} number<input name="${key}" inputmode="tel" autocomplete="off" value="${esc(s[key] || '')}" placeholder="01XXXXXXXXX"></label></section>`;
      }).join('')}</div>
      <label class="f" style="margin-top:14px">Checkout payment instructions<textarea name="pay_note" maxlength="500">${esc(s.pay_note || '')}</textarea></label>
      <button class="btn" id="paysave">Save payment settings</button> <span class="err" id="payerr" role="alert"></span></form></div>`;
    $('#payform').onsubmit = async e => {
      e.preventDefault(); const f = e.target, values = Object.fromEntries(new FormData(f));
      methods.forEach(([key]) => values[key + '_enabled'] = f.elements[key + '_enabled'].checked ? '1' : '0');
      $('#payerr').textContent = ''; $('#paysave').disabled = true;
      try { await api('/api/admin/settings', { method: 'POST', body: values }); toast('Payment settings saved'); }
      catch (er) { $('#payerr').textContent = er.message; }
      finally { $('#paysave').disabled = false; }
    };
  }

  TABS.payments = ['Payments', payments];
  const button = document.createElement('button'); button.className = 'nv'; button.dataset.t = 'payments'; button.textContent = '💳 Payments';
  const after = document.querySelector('#side .nv[data-t="cps"]');
  if (after) after.insertAdjacentElement('afterend', button);
  button.onclick = () => go('payments');
})();
