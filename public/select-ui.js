'use strict';
/* Shared, keyboard-friendly select menu for storefront and admin forms. */
(() => {
  const states = new Set(), bySelect = new WeakMap();
  let scanQueued = false, sequence = 0;

  function sync(state, force = false) {
    const { select, button, label, menu } = state;
    const optionSig = [...select.options].map(o => `${o.textContent}\u0001${o.value}\u0001${o.disabled}`).join('\u0002');
    const index = select.selectedIndex;
    label.textContent = index >= 0 ? select.options[index].textContent : 'Choose…';
    button.disabled = select.disabled;
    button.setAttribute('aria-disabled', String(select.disabled));
    button.title = label.textContent;
    if (!force && state.signature === optionSig && state.index === index) return;
    state.signature = optionSig; state.index = index;
    menu.replaceChildren();
    [...select.options].forEach((option, i) => {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'select-option';
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(i === index)); item.disabled = option.disabled;
      const tick = document.createElement('span'); tick.className = 'select-tick'; tick.setAttribute('aria-hidden', 'true'); tick.textContent = i === index ? '✓' : '';
      const text = document.createElement('span'); text.className = 'select-option-text'; text.textContent = option.textContent;
      item.append(tick, text); item.dataset.index = i;
      item.onmouseenter = () => { state.active = i; };
      item.onclick = () => choose(state, i);
      item.onkeydown = e => optionKeydown(e, state, i);
      menu.append(item);
    });
  }

  function close(state, restoreFocus = false) {
    if (!state.open) return;
    state.open = false; state.button.setAttribute('aria-expanded', 'false'); state.menu.hidden = true; state.menu.classList.remove('select-up');
    if (restoreFocus && state.select.isConnected) state.button.focus();
  }

  function closeAll(except) { states.forEach(s => { if (s !== except) close(s); }); }

  function position(state) {
    if (!state.open || !state.select.isConnected) return;
    const r = state.button.getBoundingClientRect(), margin = 10, roomBelow = window.innerHeight - r.bottom - margin - 7, roomAbove = r.top - margin - 7;
    const up = roomBelow < Math.min(220, 300) && roomAbove > roomBelow;
    const maxH = Math.max(96, Math.min(300, up ? roomAbove : roomBelow));
    state.menu.classList.toggle('select-up', up);
    state.menu.style.left = `${Math.max(margin, Math.min(r.left, window.innerWidth - Math.max(r.width, 170) - margin))}px`;
    state.menu.style.width = `${Math.max(r.width, 170)}px`;
    state.menu.style.maxHeight = `${maxH}px`;
    state.menu.style.top = up ? `${Math.max(margin, r.top - Math.min(state.menu.scrollHeight || maxH, maxH) - 7)}px` : `${r.bottom + 7}px`;
  }

  function open(state, focusIndex) {
    if (state.select.disabled) return;
    closeAll(state); sync(state, true); state.open = true; state.menu.hidden = false;
    state.button.setAttribute('aria-expanded', 'true'); state.active = Number.isInteger(focusIndex) ? focusIndex : Math.max(0, state.select.selectedIndex);
    position(state);
    const item = state.menu.querySelector(`[data-index="${state.active}"]`);
    if (item && !item.disabled) item.focus();
  }

  function choose(state, index) {
    const option = state.select.options[index]; if (!option || option.disabled) return;
    state.select.selectedIndex = index;
    state.select.dispatchEvent(new Event('input', { bubbles: true }));
    state.select.dispatchEvent(new Event('change', { bubbles: true }));
    sync(state, true); close(state, true);
  }

  function move(state, from, delta) {
    let i = from;
    do { i = (i + delta + state.select.options.length) % state.select.options.length; } while (state.select.options[i]?.disabled && i !== from);
    const item = state.menu.querySelector(`[data-index="${i}"]`); if (item) { state.active = i; item.focus(); item.scrollIntoView({ block: 'nearest' }); }
  }

  function optionKeydown(e, state, index) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(state, index, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(state, index, -1); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const options = [...state.menu.querySelectorAll('.select-option:not(:disabled)')], item = e.key === 'Home' ? options[0] : options.at(-1); if (item) { state.active = +item.dataset.index; item.focus(); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(state, true); }
    else if (e.key === 'Tab') close(state);
  }

  function enhance(select) {
    if (bySelect.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement('span'), button = document.createElement('button'), label = document.createElement('span'), chevron = document.createElement('span'), menu = document.createElement('div');
    wrapper.className = 'select-ui';
    if (select.matches('.toolbar select,.of select') || select.style.width === 'auto') wrapper.classList.add('select-compact');
    button.type = 'button'; button.className = 'select-trigger'; button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
    label.className = 'select-label'; chevron.className = 'select-chevron'; chevron.setAttribute('aria-hidden', 'true');
    button.append(label, chevron);
    menu.className = 'select-menu'; menu.id = `select-menu-${++sequence}`; menu.setAttribute('role', 'listbox'); menu.hidden = true; button.setAttribute('aria-controls', menu.id);
    const parent = select.parentNode; parent.insertBefore(wrapper, select); wrapper.append(select, button);
    const state = { select, wrapper, button, label, menu, open: false, active: 0, signature: '', index: -1 };
    bySelect.set(select, state); states.add(state); document.body.append(menu);
    select.classList.add('select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    select.addEventListener('change', () => sync(state, true)); select.addEventListener('input', () => sync(state, true));
    select.addEventListener('invalid', e => { e.preventDefault(); button.focus(); });
    button.onclick = e => { e.preventDefault(); state.open ? close(state) : open(state); };
    button.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(state, Math.max(0, select.selectedIndex)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.open ? close(state) : open(state); }
      else if (e.key === 'Escape') close(state);
    };
    const form = select.form; if (form) form.addEventListener('reset', () => requestAnimationFrame(() => sync(state, true)));
    sync(state, true);
  }

  function scan() {
    scanQueued = false;
    document.querySelectorAll('select').forEach(enhance);
    states.forEach(state => {
      if (!state.select.isConnected) { close(state); state.menu.remove(); states.delete(state); return; }
      sync(state); if (state.open) position(state);
    });
  }
  function scheduleScan() { if (!scanQueued) { scanQueued = true; requestAnimationFrame(scan); } }

  document.addEventListener('pointerdown', e => {
    states.forEach(s => { if (s.open && !s.wrapper.contains(e.target) && !s.menu.contains(e.target)) close(s); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  addEventListener('resize', () => states.forEach(position));
  addEventListener('scroll', () => states.forEach(position), true);
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
