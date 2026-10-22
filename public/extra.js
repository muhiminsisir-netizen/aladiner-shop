'use strict';
/* extra.js : app.js er por load hoy. app.js e hat dite hoy na. */
(() => {
  const wa = () => String(cfg.whatsapp || '').replace(/\D/g, '');

  // WhatsApp floating button (admin Settings e number thakle)
  function fab() {
    let a = document.getElementById('wafab'); const n = wa();
    if (!n) { if (a) a.remove(); return; }
    if (!a) {
      a = document.createElement('a'); a.id = 'wafab'; a.className = 'wafab';
      a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', 'Chat on WhatsApp'); a.textContent = '💬';
      document.body.appendChild(a);
    }
    a.href = 'https://wa.me/' + n;
  }

  // Product page: trust badges + "Ask on WhatsApp"
  function pdp() {
    const d = document.querySelector('.dlv');
    if (!d || document.querySelector('.pt2')) return;
    const h = document.querySelector('.pinfo h1'), n = wa();
    d.insertAdjacentHTML('afterend',
      '<div class="trust pt2"><span>✅ Genuine product</span><span>↩ Easy return</span><span>💵 Pay on delivery</span></div>' +
      (n && h ? '<a class="btn ghost block wabtn" target="_blank" rel="noopener" href="https://wa.me/' + n + '?text=' +
        encodeURIComponent('Hi, I want to ask about: ' + h.textContent) + '">💬 Ask on WhatsApp</a>' : ''));
  }

  // Checkout e focus mode (menu, bottom nav, announcement lukano)
  const co = () => document.body.classList.toggle('co', location.hash.startsWith('#/checkout'));
  addEventListener('hashchange', co); co();

  new MutationObserver(pdp).observe(document.getElementById('app'), { childList: true, subtree: true });
  new MutationObserver(fab).observe(document.getElementById('foot'), { childList: true });
  fab();
})();