'use strict';
/* admin-extra.js : admin.html er shesh e load hoy */
(() => {
  const css = document.createElement('style');
  css.textContent = ':root{--pr:#4f46e5;--grad:linear-gradient(135deg,#4f46e5,#6366f1 60%,#7c6cf5)}' +
    'body{font-family:"Plus Jakarta Sans","Hind Siliguri",system-ui,sans-serif}#side{overflow:auto}' +
    '.stat.click{cursor:pointer;transition:.2s}.stat.click:hover{transform:translateY(-2px);border-color:var(--pr)}' +
    '.btn.sm{text-decoration:none}.tip{display:flex;gap:10px;align-items:center;justify-content:space-between;background:#fef3c7;color:#78350f;border-color:#fde68a}';
  document.head.appendChild(css);
  const fl = document.createElement('link');
  fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600&display=swap';
  document.head.appendChild(fl);

  const v = document.getElementById('view');
  function enh() {
    // ---- Dashboard ----
    const st = v.querySelector('.stats');
    if (st && !st.dataset.x) {
      st.dataset.x = 1;
      [...st.children].forEach(c => {
        const t = c.querySelector('small').textContent;
        const link = f => { c.classList.add('click'); c.onclick = () => { OF.status = f.status || ''; OF.ps = f.ps || ''; OF.q = ''; go('ords'); }; };
        if (t === 'Awaiting action') link({ status: 'Pending' });
        if (t === 'Payments to verify') link({ ps: 'Verifying' });
      });
      api('/api/admin/stats?days=7').then(s => {
        if (v.contains(st)) st.insertAdjacentHTML('afterbegin',
          '<div class="stat"><small>Today</small><b>' + tk(s.todayRevenue) + '</b><small>' + s.todayOrders + ' orders</small></div>');
      }).catch(() => { });
      if (!localStorage.getItem('pwtip')) {
        v.insertAdjacentHTML('afterbegin', '<div class="box tip" id="pwtip"><span>🔐 Default admin password change korecho? Settings > Change admin password.</span><button class="btn gh sm" id="tipx">Done</button></div>');
        document.getElementById('tipx').onclick = () => { localStorage.setItem('pwtip', '1'); document.getElementById('pwtip').remove(); };
      }
    }

    // ---- Orders: payment filter ----
    const csv = v.querySelector('#csv');
    if (csv && !v.querySelector('#opay')) {
      csv.insertAdjacentHTML('beforebegin', '<select id="opay" style="width:auto"><option value="">All payments</option>' +
        ['Unpaid', 'Verifying', 'Paid'].map(s => '<option' + (OF.ps === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>');
      v.querySelector('#opay').onchange = e => { OF.ps = e.target.value; v.querySelector('#oq').dispatchEvent(new Event('input')); };
    }

    // ---- Orders: WhatsApp / Call button ----
    v.querySelectorAll('.ord:not([data-x])').forEach(o => {
      o.dataset.x = 1;
      const m = (o.querySelector('.ob').textContent.match(/01[3-9]\d{8}/) || [])[0], f = o.querySelector('.of');
      if (m && f) f.insertAdjacentHTML('beforeend',
        '<a class="btn gh sm" target="_blank" rel="noopener" href="https://wa.me/88' + m + '">💬 WhatsApp</a><a class="btn gh sm" href="tel:' + m + '">📞 Call</a>');
    });
  }
  new MutationObserver(enh).observe(v, { childList: true, subtree: true });
  enh();
})();