// usage: node patch-phase1.js [publicFolder]   (project root theke chalao)
const fs = require('fs'), path = require('path');
const PUB = process.argv[2] || 'public';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('Marker not found/unique: ' + a.slice(0, 70)); return s.replace(a, () => b); };
const cut = (s, from, to, mid) => { const i = s.indexOf(from), j = s.indexOf(to); if (i < 0 || j < i) throw new Error('Marker not found: ' + from.slice(0, 70)); return s.slice(0, i) + mid + s.slice(j); };
for (const f of ['server.js', path.join(PUB, 'admin.html'), 'features.js', path.join(PUB, 'admin-catalog.js')]) if (!fs.existsSync(f)) throw new Error('Missing: ' + f);
let s = fs.readFileSync('server.js', 'utf8'), h = fs.readFileSync(path.join(PUB, 'admin.html'), 'utf8');
if (s.includes("require('./features')")) { console.log('Already patched'); process.exit(); }
fs.copyFileSync('server.js', 'server.js.bak'); fs.copyFileSync(path.join(PUB, 'admin.html'), path.join(PUB, 'admin.html.bak'));
s = rep(s, "app.get('/api/admin/stats', need, admin,", "const F = require('./features')(app, db, { need, admin, upload, checkImgs, drop });\napp.get('/api/admin/stats', need, admin,");
s = cut(s, "app.get('/api/categories', (req, res) =>", "app.get('/api/products/by-ids'", '// /api/categories ekhon features.js e\n');
s = cut(s, "app.post('/api/admin/products', need, admin, upload.array('images', 6), checkImgs, (req, res) => {", "app.post('/api/admin/products/:id/stock'", `app.post('/api/admin/products', need, admin, upload.array('images', 6), checkImgs, (req, res) => {
  if (!validP(req.body)) { drop(req); return res.status(400).json({ error: 'Please enter a valid name, price and stock' }); }
  try {
    const imgs = (req.files || []).map(f => '/uploads/' + f.filename), c = F.resolve(req.body), row = pf(req.body);
    row[3] = F.sku(req.body.sku, row[0], null);
    const r = db.transaction(() => { const x = db.prepare('INSERT INTO products(name,category,brand,sku,description,price,old_price,stock,image,images) VALUES(?,?,?,?,?,?,?,?,?,?)').run(...row, imgs[0] || null, JSON.stringify(imgs)); F.setCat(x.lastInsertRowid, c); return x; })();
    res.json({ ok: 1, id: r.lastInsertRowid, sku: row[3] });
  } catch (e) { drop(req); res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'This SKU is already used by another product' : e.message }); }
});
app.put('/api/admin/products/:id', need, admin, upload.array('images', 6), checkImgs, (req, res) => {
  if (!validP(req.body)) { drop(req); return res.status(400).json({ error: 'Please enter a valid name, price and stock' }); }
  try {
    const id = +req.params.id, c = F.resolve(req.body), row = pf(req.body);
    row[3] = F.sku(req.body.sku, row[0], id);
    db.transaction(() => {
      db.prepare('UPDATE products SET name=?,category=?,brand=?,sku=?,description=?,price=?,old_price=?,stock=? WHERE id=?').run(...row, id);
      F.setCat(id, c);
      if (req.files && req.files.length) { const imgs = req.files.map(f => '/uploads/' + f.filename); db.prepare('UPDATE products SET image=?,images=? WHERE id=?').run(imgs[0], JSON.stringify(imgs), id); }
    })();
    res.json({ ok: 1, sku: row[3] });
  } catch (e) { drop(req); res.status(400).json({ error: /UNIQUE/.test(e.message) ? 'This SKU is already used by another product' : e.message }); }
});
`);
h = rep(h, '<script src="/admin-theme.js"></script>', '<script src="/admin-catalog.js"></script>\n<script src="/admin-theme.js"></script>');
fs.writeFileSync('server.js', s); fs.writeFileSync(path.join(PUB, 'admin.html'), h);
console.log('OK. server.js + admin.html patched (.bak backup ache). features.js ar admin-catalog.js jothajothe rakho.');