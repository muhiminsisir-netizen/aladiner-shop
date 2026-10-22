'use strict';
/* features.js : Phase 1 - categories (3 level), unique SKU. server.js theke require hoy. */
module.exports = (app, db, X) => {
  const { need, admin, upload, checkImgs, drop } = X;
  db.exec(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,parent_id INTEGER REFERENCES categories(id),name TEXT NOT NULL,slug TEXT,image TEXT,description TEXT DEFAULT '',active INTEGER DEFAULT 1,show_menu INTEGER DEFAULT 1,show_home INTEGER DEFAULT 1,sort INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS ix_cat_parent ON categories(parent_id)`);
  if (!db.prepare('PRAGMA table_info(categories)').all().some(x => x.name === 'show_home')) db.exec('ALTER TABLE categories ADD COLUMN show_home INTEGER DEFAULT 1');
  const addCol = (c, d) => { if (!db.prepare('PRAGMA table_info(products)').all().some(x => x.name === c)) db.exec(`ALTER TABLE products ADD COLUMN ${c} ${d}`); };
  addCol('cat_id', 'INTEGER'); addCol('sub_id', 'INTEGER'); addCol('child_id', 'INTEGER'); addCol('subcategory', 'TEXT'); addCol('child_category', 'TEXT');
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
  const row = id => db.prepare('SELECT * FROM categories WHERE id=?').get(id);
  const level = c => { let n = 0; while (c && c.parent_id) { c = row(c.parent_id); n++; } return n; };
  const nextSort = p => db.prepare('SELECT COALESCE(MAX(sort),0)+1 s FROM categories WHERE parent_id IS ?').get(p).s;
  // purano text category gulo main category hishebe import
  db.transaction(() => {
    db.prepare("SELECT DISTINCT category n FROM products WHERE category IS NOT NULL AND category<>''").all().forEach(({ n }) => {
      if (!db.prepare('SELECT 1 FROM categories WHERE parent_id IS NULL AND lower(name)=lower(?)').get(n))
        db.prepare('INSERT INTO categories(name,slug,sort) VALUES(?,?,?)').run(n, slug(n), nextSort(null));
    });
    db.exec("UPDATE products SET cat_id=(SELECT id FROM categories WHERE parent_id IS NULL AND lower(name)=lower(products.category)) WHERE cat_id IS NULL AND category<>''");
  })();
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_products_sku ON products(sku COLLATE NOCASE) WHERE sku IS NOT NULL AND sku<>''"); }
  catch { console.warn('[SKU] Duplicate SKU already exist in DB. Fix them to enable DB-level uniqueness.'); }

  // ---- SKU ----
  const own = (s, self) => db.prepare('SELECT id FROM products WHERE sku=? COLLATE NOCASE AND id IS NOT ?').get(s, self ?? null) ||
    (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='variants'").get() && db.prepare('SELECT id FROM variants WHERE sku=? COLLATE NOCASE').get(s));
  const sku = (v, name, self) => {
    let s = String(v || '').trim().toUpperCase().replace(/\s+/g, '-');
    if (s.length > 60) throw new Error('SKU must be 60 characters or fewer');
    if (s) {
      if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(s)) throw new Error('SKU can only contain letters, numbers, dot, dash and underscore');
      if (own(s, self)) throw new Error(`SKU "${s}" is already used by another product`);
      return s;
    }
    const pre = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PRD';
    for (let i = 1; i < 1e5; i++) { s = pre + '-' + String(i).padStart(3, '0'); if (!own(s, self)) return s; }
    throw new Error('Could not generate SKU');
  };
  app.get('/api/admin/sku-suggest', need, admin, (req, res) => {
    try { res.json({ sku: sku('', req.query.name) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- product <-> category chain ----
  const pid = v => { const n = +v; return Number.isInteger(n) && n > 0 ? n : null; };
  const resolve = b => {
    const c = pid(b.cat_id), s = pid(b.sub_id), h = pid(b.child_id);
    if (!c) { if (s || h) throw new Error('Select a main category first'); return null; }
    const m = row(c); if (!m || m.parent_id) throw new Error('Invalid main category');
    if (h && !s) throw new Error('Select a subcategory first');
    const sc = s ? row(s) : null, cc = h ? row(h) : null;
    if (s && (!sc || sc.parent_id !== c)) throw new Error('Subcategory does not belong to the selected category');
    if (h && (!cc || cc.parent_id !== s)) throw new Error('Child category does not belong to the selected subcategory');
    return { m, sc, cc };
  };
  const setCat = (id, c) => c
    ? db.prepare('UPDATE products SET cat_id=?,sub_id=?,child_id=?,category=?,subcategory=?,child_category=? WHERE id=?').run(c.m.id, c.sc ? c.sc.id : null, c.cc ? c.cc.id : null, c.m.name, c.sc ? c.sc.name : '', c.cc ? c.cc.name : '', id)
    : db.prepare("UPDATE products SET cat_id=NULL,sub_id=NULL,child_id=NULL,subcategory='',child_category='' WHERE id=?").run(id);
  const chainOf = id => { const x = row(id), p = x.parent_id && row(x.parent_id), g = p && p.parent_id && row(p.parent_id);
    return g ? { m: g, sc: p, cc: x } : p ? { m: p, sc: x, cc: null } : { m: x, sc: null, cc: null }; };

  // ---- public ----
  const tree = (all, pidv = null) => all.filter(c => c.parent_id === pidv && c.active).map(c => ({ id: c.id, name: c.name, slug: c.slug, image: c.image, description: c.description, show_menu: c.show_menu, show_home: c.show_home, children: tree(all, c.id) }));
  app.get('/api/catalog/tree', (req, res) => res.json(tree(db.prepare('SELECT * FROM categories ORDER BY sort,id').all())));
  app.get('/api/categories/tree', (req, res) => res.json(tree(db.prepare('SELECT * FROM categories ORDER BY sort,id').all())));
  const menu = () => tree(db.prepare('SELECT * FROM categories ORDER BY sort,id').all()).filter(c => c.show_menu).map(c => ({
    ...c, category: c.name, n: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1 AND (cat_id=? OR (cat_id IS NULL AND category=?))').get(c.id, c.name).n }));
  app.get('/api/categories', (req, res) => res.json(menu()));

  // ---- admin ----
  const flag = (v, d) => v === undefined ? d : (v === '0' || v === 0 || v === false || v === 'false') ? 0 : 1;
  const text = (v, n) => String(v ?? '').trim().slice(0, n);
  const uslug = (name, p, self, requested) => { let b = slug(requested || name), s = b, i = 2; while (db.prepare('SELECT 1 FROM categories WHERE slug=? AND parent_id IS ? AND id IS NOT ?').get(s, p, self ?? null)) s = b + '-' + i++; return s; };
  const dupName = (name, p, self) => db.prepare('SELECT 1 FROM categories WHERE lower(name)=lower(?) AND parent_id IS ? AND id IS NOT ?').get(name, p, self ?? null);
  const img = req => req.file ? '/uploads/' + req.file.filename : null;
  const fail = (req, res, e, code = 400) => { drop(req); res.status(code).json({ error: e.message || e }); };

  app.get('/api/admin/categories', need, admin, (req, res) => res.json(db.prepare(
    `SELECT c.*,
      CASE WHEN c.parent_id IS NULL THEN 1 WHEN p.parent_id IS NULL THEN 2 ELSE 3 END AS level,
      (SELECT COUNT(*) FROM products WHERE cat_id=c.id OR sub_id=c.id OR child_id=c.id) products
      FROM categories c LEFT JOIN categories p ON p.id=c.parent_id ORDER BY c.sort,c.id`).all()));
  app.post('/api/admin/categories', need, admin, upload.single('image'), checkImgs, (req, res) => {
    try {
      const b = req.body || {}, name = text(b.name, 60), p = pid(b.parent_id);
      if (!name) throw new Error('Category name is required');
      if (p) { const pr = row(p); if (!pr) throw new Error('Parent category not found'); if (level(pr) >= 2) throw new Error('Child categories cannot have further sub-levels'); }
      if (dupName(name, p)) throw new Error('A category with this name already exists here');
      const r = db.prepare('INSERT INTO categories(parent_id,name,slug,image,description,active,show_menu,show_home,sort) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(p, name, uslug(name, p, null, text(b.slug, 80)), img(req), text(b.description, 500), flag(b.active, 1), flag(b.show_menu, 1), flag(b.show_home, 1), nextSort(p));
      res.json({ ok: 1, id: r.lastInsertRowid });
    } catch (e) { fail(req, res, e); }
  });
  app.put('/api/admin/categories/:id', need, admin, upload.single('image'), checkImgs, (req, res) => {
    try {
      const c = row(+req.params.id); if (!c) throw new Error('Category not found');
      const b = req.body || {}, name = text(b.name ?? c.name, 60);
      if (!name) throw new Error('Category name is required');
      if (dupName(name, c.parent_id, c.id)) throw new Error('A category with this name already exists here');
      db.transaction(() => {
        db.prepare('UPDATE categories SET name=?,slug=?,image=CASE WHEN ?=1 THEN NULL ELSE COALESCE(?,image) END,description=?,active=?,show_menu=?,show_home=? WHERE id=?')
          .run(name, uslug(name, c.parent_id, c.id, text(b.slug ?? c.slug, 80)), flag(b.remove_image, 0), img(req), text(b.description ?? c.description, 500), flag(b.active, c.active), flag(b.show_menu, c.show_menu), flag(b.show_home, c.show_home), c.id);
        if (name !== c.name) { // product e save kora naam sync
          const lv = level(c), col = ['category', 'subcategory', 'child_category'][lv], idc = ['cat_id', 'sub_id', 'child_id'][lv];
          db.prepare(`UPDATE products SET ${col}=? WHERE ${idc}=?`).run(name, c.id);
        }
      })();
      res.json({ ok: 1 });
    } catch (e) { fail(req, res, e); }
  });
  app.post('/api/admin/categories/:id/toggle', need, admin, (req, res) => {
    db.prepare('UPDATE categories SET active=1-active WHERE id=?').run(+req.params.id); res.json({ ok: 1 });
  });
  app.post('/api/admin/categories/:id/move', need, admin, (req, res) => {
    const c = row(+req.params.id); if (!c) return res.status(404).json({ error: 'Category not found' });
    const dir = (req.body || {}).dir === 'up' ? -1 : 1;
    const sib = db.prepare('SELECT id FROM categories WHERE parent_id IS ? ORDER BY sort,id').all(c.parent_id).map(x => x.id);
    const i = sib.indexOf(c.id), j = i + dir;
    if (j >= 0 && j < sib.length) { [sib[i], sib[j]] = [sib[j], sib[i]]; db.transaction(() => sib.forEach((id, k) => db.prepare('UPDATE categories SET sort=? WHERE id=?').run(k, id)))(); }
    res.json({ ok: 1 });
  });
  app.delete('/api/admin/categories/:id', need, admin, (req, res) => {
    try {
      const c = row(+req.params.id); if (!c) throw new Error('Category not found');
      const subtree = db.prepare(`WITH RECURSIVE descendants(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id=d.id) SELECT id FROM descendants`).all(c.id).map(x => x.id).sort((a, b) => level(row(b)) - level(row(a)));
      const marks = subtree.map(() => '?').join(',');
      const ids = db.prepare(`SELECT id FROM products WHERE cat_id IN (${marks}) OR sub_id IN (${marks}) OR child_id IN (${marks})`).all(...subtree, ...subtree, ...subtree).map(x => x.id);
      const reassign = String(req.query.reassign_to || '');
      const to = reassign === 'parent' ? c.parent_id : pid(reassign);
      if (ids.length && !to && reassign !== 'none') return res.status(409).json({ error: `${ids.length} product(s) use this category. Choose where to move them first.`, products: ids.length });
      db.transaction(() => {
        if (ids.length) {
          if (reassign === 'none') ids.forEach(id => setCat(id, null));
          else { const t = row(to); if (!t || subtree.includes(t.id)) throw new Error('Choose a category outside the category being deleted'); ids.forEach(id => setCat(id, chainOf(t.id))); }
        }
        subtree.forEach(id => db.prepare('DELETE FROM categories WHERE id=?').run(id));
      })();
      res.json({ ok: 1 });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  return { sku, resolve, setCat, menu };
};
