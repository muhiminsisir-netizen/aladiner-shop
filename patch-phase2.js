// usage: node patch-phase2.js [publicFolder]   (project root theke, Phase 1 patch er por)
const fs = require('fs'), path = require('path'), PUB = process.argv[2] || 'public';
const rep = (s, a, b, all) => { const n = s.split(a).length - 1; if (!n || (!all && n > 1)) throw new Error(`Marker ${n ? 'not unique' : 'not found'}: ${a.slice(0, 80)}`); return s.split(a).join(b); };
const cut = (s, from, to, mid) => { const i = s.indexOf(from), j = s.indexOf(to); if (i < 0 || j < i) throw new Error('Marker not found: ' + (i < 0 ? from : to).slice(0, 80)); return s.slice(0, i) + mid + s.slice(j); };
const files = { server: 'server.js', app: path.join(PUB, 'app.js'), idx: path.join(PUB, 'index.html'), adm: path.join(PUB, 'admin.html') };
for (const f of [...Object.values(files), 'variants.js', path.join(PUB, 'admin-variants.js'), path.join(PUB, 'variants-ui.js'), path.join(PUB, 'variants.css')]) if (!fs.existsSync(f)) throw new Error('Missing: ' + f);
let s = fs.readFileSync(files.server, 'utf8'), a = fs.readFileSync(files.app, 'utf8'), x = fs.readFileSync(files.idx, 'utf8'), h = fs.readFileSync(files.adm, 'utf8');
if (s.includes("require('./variants')")) { console.log('Already patched'); process.exit(); }
if (!s.includes("require('./features')")) throw new Error('Age Phase 1 (patch-phase1.js) chalao');
s = cut(s, "app.post('/api/cart/preview'", '// Guest tracking', `function cancelOrder(o) {
  db.prepare('SELECT product_id,variant_id,qty FROM order_items WHERE order_id=?').all(o.id).forEach(i => V.restock(i));
  if (o.coupon) db.prepare('UPDATE coupons SET used=MAX(used-1,0) WHERE code=?').run(o.coupon);
  db.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(o.id);
  db.prepare('INSERT INTO order_events(order_id,status) VALUES(?,?)').run(o.id, 'Cancelled');
}
const V = require('./variants')(app, db, { couponCheck, shipFor, PAYS, PHONE, np, orderLimit, addGuest, withImg });
`);
s = rep(s, '  p.canReview = false;', '  p.variants = V.list(p.id);\n  p.canReview = false;');
s = rep(s, "res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(withImg))", "res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(withImg).map(p => (p.variants = V.list(p.id, true), p)))");
s = rep(s, 'F.setCat(x.lastInsertRowid, c);', 'F.setCat(x.lastInsertRowid, c); V.saveExtras(x.lastInsertRowid, req.body);');
s = rep(s, 'F.setCat(id, c);', 'F.setCat(id, c); V.saveExtras(id, req.body);');
s = rep(s, "app.post('/api/admin/products/:id/stock'", "app.post('/api/admin/products/:id/stock', need, admin, (req, res, next) => V.hasVariants(+req.params.id) ? res.status(400).json({ error: 'This product uses size variants. Edit stock per size in the product form.' }) : next());\napp.post('/api/admin/products/:id/stock'");
a = rep(a, '({ id: l.id, qty: l.qty })', '({ id: l.id, qty: l.qty, v: l.v })', true);
x = rep(x, '<link rel="stylesheet" href="/theme.css">', '<link rel="stylesheet" href="/theme.css">\n<link rel="stylesheet" href="/variants.css">');
x = rep(x, '<script src="/extra.js"></script>', '<script src="/extra.js"></script>\n<script src="/variants-ui.js"></script>');
h = rep(h, '<script src="/admin-theme.js"></script>', '<script src="/admin-variants.js"></script>\n<script src="/admin-theme.js"></script>');
for (const [f, c] of [[files.server, s], [files.app, a], [files.idx, x], [files.adm, h]]) { fs.copyFileSync(f, f + '.p2.bak'); fs.writeFileSync(f, c); }
console.log('OK. Phase 2+3 patched (*.p2.bak backup ache). Server restart koro.');