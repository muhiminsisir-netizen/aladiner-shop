'use strict';
/* variants.js : Phase 2+3 - size variants, per-variant SKU/stock, variant-aware cart/order, description table */
const crypto = require('crypto');
module.exports = (app, db, X) => {
  const { couponCheck, shipFor, PAYS, PHONE, np, orderLimit, addGuest, withImg, enqueueOrderEmail = () => {}, scheduleOrderEmail = () => {} } = X;
  db.exec(`CREATE TABLE IF NOT EXISTS variants(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,name TEXT NOT NULL,sku TEXT,price REAL,stock INTEGER DEFAULT 0,active INTEGER DEFAULT 1,sort INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS ix_var_prod ON variants(product_id)`);
  const addCol = (t, c, d) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
  addCol('products', 'has_variants', 'INTEGER DEFAULT 0'); addCol('products', 'desc_table', 'TEXT');
  addCol('order_items', 'variant_id', 'INTEGER'); addCol('order_items', 'variant', 'TEXT'); addCol('order_items', 'sku', 'TEXT');
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_variants_sku ON variants(sku COLLATE NOCASE) WHERE sku IS NOT NULL AND sku<>''"); } catch { console.warn('[SKU] variant index failed'); }

  const list = (pid, all) => db.prepare(`SELECT id,name,sku,price,stock,active FROM variants WHERE product_id=? ${all ? '' : 'AND active=1'} ORDER BY sort,id`).all(pid);
  const hasVariants = pid => !!(db.prepare('SELECT has_variants h FROM products WHERE id=?').get(pid) || {}).h;
  const sync = pid => { if (hasVariants(pid)) db.prepare('UPDATE products SET stock=(SELECT COALESCE(SUM(stock),0) FROM variants WHERE product_id=? AND active=1) WHERE id=?').run(pid, pid); };
  const restock = i => {
    if (i.variant_id) {
      db.prepare('UPDATE variants SET stock=stock+? WHERE id=?').run(i.qty, i.variant_id);
      if (hasVariants(i.product_id)) sync(i.product_id);
      else db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id);
    }
    else db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id);
  };
  const cleanTable = v => {
    if (!v) return null; let t; try { t = typeof v === 'string' ? JSON.parse(v) : v; } catch { throw new Error('Invalid table data'); }
    if (!t || !Array.isArray(t.rows) || !t.rows.length) return null;
    if (t.rows.length > 40 || t.rows.some(r => !Array.isArray(r) || r.length > 12)) throw new Error('Table is too large (max 40 rows, 12 columns)');
    const w = Math.max(...t.rows.map(r => r.length)), rows = t.rows.map(r => Array.from({ length: w }, (_, i) => String(r[i] ?? '').slice(0, 120)));
    return rows.some(r => r.some(c => c.trim())) ? JSON.stringify({ title: String(t.title || '').slice(0, 80), rows }) : null;
  };
  const saveExtras = (pid, b) => {
    if ('desc_table' in b) db.prepare('UPDATE products SET desc_table=? WHERE id=?').run(cleanTable(b.desc_table), pid);
    if (!('has_variants' in b) && !('variants' in b)) return;
    if (!(b.has_variants === '1' || b.has_variants === 1 || b.has_variants === true)) { db.prepare('UPDATE products SET has_variants=0 WHERE id=?').run(pid); return; }
    let arr; try { arr = JSON.parse(b.variants || '[]'); } catch { throw new Error('Invalid variants data'); }
    if (!Array.isArray(arr) || !arr.length || arr.length > 30) throw new Error('Add at least one size/variant (max 30)');
    const base = (db.prepare('SELECT sku FROM products WHERE id=?').get(pid) || {}).sku || 'ITEM', names = new Set(), skus = new Set(), keep = [];
    arr.forEach((x, i) => {
      const name = String(x.name || '').trim().slice(0, 30); if (!name) throw new Error('Every variant needs a name (e.g. S, M, L)');
      if (names.has(name.toLowerCase())) throw new Error(`Duplicate variant name "${name}"`); names.add(name.toLowerCase());
      const stock = Math.floor(+x.stock); if (!(stock >= 0 && stock <= 1e6)) throw new Error(`Enter a valid stock for ${name}`);
      const price = x.price === '' || x.price == null ? null : +x.price; if (price !== null && !(price > 0)) throw new Error(`Enter a valid price for ${name}`);
      let sku = String(x.sku || '').trim().toUpperCase().replace(/\s+/g, '-').slice(0, 60) || (base + '-' + name.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 60);
      if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) throw new Error(`Invalid SKU "${sku}"`);
      if (skus.has(sku)) throw new Error(`SKU "${sku}" is used twice`); skus.add(sku);
      const vid = +x.id > 0 ? +x.id : null;
      if (vid && !db.prepare('SELECT 1 FROM variants WHERE id=? AND product_id=?').get(vid, pid)) throw new Error('Invalid variant');
      if (db.prepare('SELECT 1 FROM variants WHERE sku=? COLLATE NOCASE AND id IS NOT ?').get(sku, vid) || db.prepare('SELECT 1 FROM products WHERE sku=? COLLATE NOCASE').get(sku))
        throw new Error(`SKU "${sku}" is already used by another product or variant`);
      keep.push({ vid, name, sku, price, stock, active: (x.active === 0 || x.active === '0' || x.active === false) ? 0 : 1, sort: i });
    });
    const ids = keep.map(k => k.vid).filter(Boolean);
    db.prepare('SELECT id FROM variants WHERE product_id=?').all(pid).filter(r => !ids.includes(r.id)).forEach(r => {
      if (db.prepare('SELECT 1 FROM order_items WHERE variant_id=?').get(r.id)) db.prepare('UPDATE variants SET active=0 WHERE id=?').run(r.id);
      else db.prepare('DELETE FROM variants WHERE id=?').run(r.id);
    });
    keep.forEach(k => k.vid
      ? db.prepare('UPDATE variants SET name=?,sku=?,price=?,stock=?,active=?,sort=? WHERE id=?').run(k.name, k.sku, k.price, k.stock, k.active, k.sort, k.vid)
      : db.prepare('INSERT INTO variants(product_id,name,sku,price,stock,active,sort) VALUES(?,?,?,?,?,?,?)').run(pid, k.name, k.sku, k.price, k.stock, k.active, k.sort));
    db.prepare('UPDATE products SET has_variants=1 WHERE id=?').run(pid); sync(pid);
  };

  // ---- cart preview (variant-aware) ----
  app.post('/api/cart/preview', (req, res) => {
    const b = req.body || {}, lines = [];
    for (const i of (Array.isArray(b.items) ? b.items : []).slice(0, 50)) {
      const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+i.id); if (!p) continue;
      withImg(p); let price = p.price, stock = p.stock, v = null;
      if (p.has_variants) { v = db.prepare('SELECT * FROM variants WHERE id=? AND product_id=? AND active=1').get(+i.v, p.id); if (!v) continue; price = v.price ?? p.price; stock = v.stock; }
      if (stock < 1) continue;
      lines.push({ id: p.id, v: v ? v.id : null, variant: v ? v.name : null, sku: v ? v.sku : p.sku, name: v ? `${p.name} (${v.name})` : p.name, image: p.image, price, stock, qty: Math.max(1, Math.min(Math.floor(+i.qty) || 1, stock)) });
    }
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
    let cp = null, couponError = null;
    if (b.coupon && lines.length) { try { cp = couponCheck(b.coupon, subtotal); } catch (e) { couponError = e.message; } }
    const discount = cp ? cp.discount : 0, shipping = lines.length ? shipFor(subtotal - discount, b.area) : 0;
    res.json({ lines, subtotal, discount, coupon: cp && cp.code, couponError, shipping, total: subtotal - discount + shipping });
  });

  // ---- place order (variant-aware, server e stock check) ----
  app.post('/api/orders', orderLimit, (req, res) => {
    const { items, name, address, area, idem, coupon, note, pay = 'cod', trx } = req.body || {};
    const phone = np((req.body || {}).phone), email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!String(name || '').trim() || !String(address || '').trim() || !PHONE.test(phone) || !['dhaka', 'outside'].includes(area) || !idem || String(idem).length > 80 || !PAYS[pay])
      return res.status(400).json({ error: 'Please enter a valid name, phone, area and address' });
    if (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) return res.status(400).json({ error: 'Enter a valid email address or leave it blank' });
    const t = String(trx || '').trim().toUpperCase();
    if (pay !== 'cod' && !/^[A-Z0-9]{6,16}$/.test(t)) return res.status(400).json({ error: 'Enter the ' + PAYS[pay] + ' Transaction ID (6-16 letters/numbers)' });
    const dup = db.prepare('SELECT id FROM orders WHERE idem=?').get(String(idem));
    if (dup) { if (!req.session.uid) addGuest(req, dup.id); return res.json({ id: dup.id }); }
    try {
      const id = db.transaction(() => {
        if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error('Your cart is empty');
        if (pay !== 'cod' && db.prepare('SELECT 1 FROM orders WHERE trx=?').get(t)) throw new Error('This Transaction ID was already used');
        const oid = 'ORD-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
        let sub = 0; const rows = [];
        for (const i of items) {
          const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+i.id), q = Math.floor(+i.qty);
          if (!p || !(q > 0) || q > 99) throw new Error('A product in your cart is no longer available');
          let price = p.price, vname = null, vid = null, sk = p.sku;
          if (p.has_variants) {
            const v = db.prepare('SELECT * FROM variants WHERE id=? AND product_id=? AND active=1').get(+i.v, p.id);
            if (!v) throw new Error('Please select a valid size for ' + p.name);
            if (!db.prepare('UPDATE variants SET stock=stock-? WHERE id=? AND stock>=?').run(q, v.id, q).changes) throw new Error(`${p.name} (${v.name}) does not have enough stock`);
            price = v.price ?? p.price; vname = v.name; vid = v.id; sk = v.sku; sync(p.id);
          } else if (!db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(q, p.id, q).changes) throw new Error(p.name + ' does not have enough stock');
          sub += price * q; rows.push([p.id, vname ? `${p.name} (${vname})` : p.name, price, q, vid, vname, sk]);
        }
        const cp = couponCheck(coupon, sub);
        if (cp && !db.prepare('UPDATE coupons SET used=used+1 WHERE code=? AND (max_uses=0 OR used<max_uses)').run(cp.code).changes) throw new Error('This coupon has reached its usage limit');
        const disc = cp ? cp.discount : 0, ship = shipFor(sub - disc, area);
        db.prepare('INSERT INTO orders(id,user_id,name,phone,email,address,subtotal,shipping,total,idem,discount,coupon,note,area,payment,payment_status,trx) VALUES(@id,@uid,@name,@phone,@email,@address,@sub,@ship,@total,@idem,@disc,@coupon,@note,@area,@payment,@ps,@trx)')
          .run({ id: oid, uid: req.session.uid || null, name: String(name).trim().slice(0, 80), phone, email: email || null, address: String(address).trim().slice(0, 500), sub, ship, total: sub - disc + ship, idem: String(idem), disc, coupon: cp ? cp.code : null, note: String(note || '').slice(0, 300), area, payment: PAYS[pay], ps: pay === 'cod' ? 'Unpaid' : 'Verifying', trx: pay === 'cod' ? null : t });
        rows.forEach(r => db.prepare('INSERT INTO order_items(order_id,product_id,name,price,qty,variant_id,variant,sku) VALUES(?,?,?,?,?,?,?,?)').run(oid, ...r));
        db.prepare('INSERT INTO order_events(order_id,status) VALUES(?,?)').run(oid, 'Pending');
        enqueueOrderEmail(oid);
        return oid;
      })();
      if (!req.session.uid) addGuest(req, id);
      scheduleOrderEmail(id);
      res.json({ id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  return { list, saveExtras, restock, hasVariants };
};
