const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

// Optional local .env support. Existing process environment always takes precedence.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || Object.prototype.hasOwnProperty.call(process.env, m[1])) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    process.env[m[1]] = value;
  }
}

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'shop.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,hash TEXT,role TEXT DEFAULT 'customer',created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,brand TEXT,sku TEXT,description TEXT,price REAL,old_price REAL,stock INTEGER,image TEXT,active INTEGER DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,phone TEXT,address TEXT,subtotal REAL,shipping REAL,total REAL,status TEXT DEFAULT 'Pending',payment TEXT DEFAULT 'Cash on Delivery',idem TEXT UNIQUE,tracking TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,product_id INTEGER,name TEXT,price REAL,qty INTEGER);
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,status TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,user_id TEXT,rating INTEGER,comment TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(product_id,user_id));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS banners(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,subtitle TEXT,link TEXT,image TEXT,active INTEGER DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS coupons(code TEXT PRIMARY KEY,type TEXT,value REAL,min_order REAL DEFAULT 0,max_uses INTEGER DEFAULT 0,used INTEGER DEFAULT 0,expires TEXT,active INTEGER DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS ix_items_order ON order_items(order_id);
`);
// Safe migration: purano database e notun column add
const addCol = (t, c, d) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
addCol('products', 'images', 'TEXT');
addCol('orders', 'discount', 'REAL DEFAULT 0');
addCol('orders', 'coupon', 'TEXT');
addCol('orders', 'note', 'TEXT');
addCol('orders', 'area', 'TEXT');
addCol('orders', 'payment_status', "TEXT DEFAULT 'Unpaid'");
addCol('orders', 'trx', 'TEXT');
addCol('orders', 'email', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS ix_orders_phone ON orders(phone)');

const DEF = {
  store_name: 'My Shop', announcement: 'Cash on Delivery available across Bangladesh',
  ship_dhaka: '60', ship_outside: '120', free_ship: '0',
  phone: '', whatsapp: '', facebook: '', instagram: '', address: '', hours: '',
  bkash: '', nagad: '', rocket: '', bkash_enabled: '', nagad_enabled: '', rocket_enabled: '', pay_note: 'Send Money to the number above, then enter your Transaction ID at checkout.',
  about: 'Welcome to our shop. Edit this text from Admin > Settings.',
  logo_url: '', logo_position: 'left', logo_bg_opacity: '0',
  shipping_policy: '', return_policy: '', privacy: '', terms: ''
};
Object.assign(DEF, { c_deep: '#0B2A5B', c_forest: '#1D4ED8', c_sage: '#3B82F6', c_light: '#BFDBFE', c_brown: '#475569', c_tan: '#94A3B8', c_cream: '#DBEAFE', c_gold: '#F59E0B', o_bg: '', o_surface: '', o_text: '', o_muted: '', o_primary: '', o_accent: '', o_danger: '', o_ann_bg: '', o_ann_tx: '', o_foot_bg: '', o_foot_tx: '' });
Object.entries(DEF).forEach(([k, v]) => db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v));
const S = () => Object.fromEntries(db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE 'order_email_%'").all().map(r => [r.key, r.value]));

if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase(), pw = process.env.ADMIN_PASSWORD || '';
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 14) throw new Error('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 14 characters), then restart.');
  db.prepare('INSERT INTO users(id,name,email,phone,hash,role) VALUES(?,?,?,?,?,?)')
    .run(crypto.randomUUID(), 'Admin', email, '', bcrypt.hashSync(pw, 12), 'admin');
}
if (!db.prepare('SELECT 1 FROM products').get()) {
  const ins = db.prepare('INSERT INTO products(name,category,brand,sku,description,price,old_price,stock) VALUES(?,?,?,?,?,?,?,?)');
  ins.run('[DEMO] Cotton T-Shirt', 'Fashion', 'Demo', 'DEMO-1', 'Demo product. Delete or edit from admin.', 650, 850, 20);
  ins.run('[DEMO] Wireless Earbuds', 'Electronics', 'Demo', 'DEMO-2', 'Demo product.', 1800, 2200, 10);
  ins.run('[DEMO] Water Bottle', 'Home', 'Demo', 'DEMO-3', 'Demo product.', 400, null, 30);
  ins.run('[DEMO] Backpack', 'Fashion', 'Demo', 'DEMO-4', 'Demo product.', 1500, 1900, 5);
}

// Session secret: env > file (private permission)
let secret = process.env.SESSION_SECRET;
if (!secret) {
  const secretFile = path.join(__dirname, '.session-secret');
  try { secret = fs.readFileSync(secretFile, 'utf8').trim(); }
  catch { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, secret, { mode: 0o600 }); }
}
if (String(secret || '').length < 32) throw new Error('SESSION_SECRET or .session-secret must contain at least 32 characters.');

const app = express();
app.disable('x-powered-by');
   app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  next();
});
// CSRF guard: browser theke ashha write request same site theke na hole block
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin');
  if (o) { try { if (new URL(o).host !== req.get('host')) throw 0; } catch { return res.status(403).json({ error: 'Blocked request' }); } }
  next();
});
   app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sid', secret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

const PHONE = /^01[3-9]\d{8}$/;
const np = p => String(p || '').replace(/[\s-]/g, '').replace(/^\+?88/, '');
const STATUSES = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const PSTAT = ['Unpaid', 'Verifying', 'Paid'];
const PAYS = { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
const need = (req, res, next) => req.session.uid ? next() : res.status(401).json({ error: 'Please login first' });
const admin = (req, res, next) => {
  const u = req.session.uid && db.prepare('SELECT role FROM users WHERE id=?').get(req.session.uid);
  u && u.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });
};
const mkLimit = (max, win = 9e5) => {
  const m = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of m) { const f = v.filter(t => n - t < win); f.length ? m.set(k, f) : m.delete(k); } }, 6e4).unref();
  return (req, res, next) => {
    const n = Date.now(), a = (m.get(req.ip) || []).filter(t => n - t < win);
    if (a.length >= max) return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    a.push(n); m.set(req.ip, a); next();
  };
};
const limit = mkLimit(20), orderLimit = mkLimit(15), trackLimit = mkLimit(15);
const DUMMY = bcrypt.hashSync('timing-guard', 10);
const lk = s => '%' + String(s).slice(0, 100).replace(/[\\%_]/g, '\\$&') + '%';

// guest order gulo session e rakhi; login/register korle account e jure jay
const signIn = (req, res, id) => {
  const g = req.session.guest || [];
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.uid = id;
    if (g.length) db.prepare(`UPDATE orders SET user_id=? WHERE user_id IS NULL AND id IN (${g.map(() => '?').join(',')})`).run(id, ...g);
    res.json({ ok: 1 });
  });
};
const addGuest = (req, id) => { const g = req.session.guest || []; if (!g.includes(id)) g.push(id); req.session.guest = g.slice(-20); };
const isAdmin = req => { const u = req.session.uid && db.prepare('SELECT role FROM users WHERE id=?').get(req.session.uid); return !!(u && u.role === 'admin'); };
const mine = (req, o) => !!o && ((req.session.uid && o.user_id === req.session.uid) || (req.session.guest || []).includes(o.id));
const withImg = p => {
  let l = []; try { l = JSON.parse(p.images || '[]'); } catch { }
  if (!l.length && p.image) l = [p.image];
  p.gallery = l; p.image = l[0] || null; delete p.images; return p;
};

// ---------- Auth ----------
app.post('/api/register', limit, (req, res) => {
  const { name, password } = req.body || {}, raw = String((req.body || {}).identifier || (req.body || {}).email || (req.body || {}).phone || '').trim();
  const email = raw.includes('@') ? raw.toLowerCase().slice(0, 120) : null, phone = email ? null : np(raw);
  if (!String(name || '').trim() || !(email ? /^\S+@\S+\.\S+$/.test(email) : PHONE.test(phone)) || String(password || '').length < 12)
    return res.status(400).json({ error: 'Enter your name, one valid email or BD phone number, and a password of at least 12 characters' });
  try {
    const id = crypto.randomUUID();
    db.transaction(() => {
      if (email && db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email)) throw new Error('IDENTITY_EXISTS');
      if (phone && db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone)) throw new Error('IDENTITY_EXISTS');
      db.prepare('INSERT INTO users(id,name,email,phone,hash) VALUES(?,?,?,?,?)')
        .run(id, String(name).trim().slice(0, 80), email, phone, bcrypt.hashSync(String(password), 12));
    })();
    signIn(req, res, id);
  } catch (e) { res.status(400).json({ error: e.message === 'IDENTITY_EXISTS' || e.message.includes('UNIQUE') ? 'This phone or email cannot be used. If you already have an account, sign in.' : e.message }); }
});
app.post('/api/login', limit, (req, res) => {
  const { password } = req.body || {}, raw = String((req.body || {}).identifier || (req.body || {}).email || (req.body || {}).phone || '').trim();
  let candidates = [];
  if (raw.includes('@')) { const u = db.prepare('SELECT * FROM users WHERE lower(email)=?').get(raw.toLowerCase()); if (u) candidates = [u]; }
  else if (PHONE.test(np(raw))) {
    candidates = db.prepare('SELECT * FROM users WHERE phone=?').all(np(raw));
  }
  const matching = candidates.filter(u => bcrypt.compareSync(String(password || ''), u.hash));
  if (!candidates.length) bcrypt.compareSync(String(password || ''), DUMMY);
  if (matching.length !== 1) return res.status(400).json({ error: 'Wrong phone/email or password' });
  const u = matching[0];
  signIn(req, res, u.id);
});
app.post('/api/logout', (req, res) => req.session.destroy(() => { res.clearCookie('sid'); res.json({ ok: 1 }); }));
app.get('/api/me', (req, res) => {
  const u = req.session.uid && db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(req.session.uid);
  res.json(u || null);
});
require('./appearance')(app, db, { need, admin }); // Phase 4: banners + appearance (purano /api/banners er age)
app.get('/api/settings', (req, res) => res.json(S()));
app.get('/api/banners', (req, res) =>
  res.json(db.prepare('SELECT id,title,subtitle,link,image FROM banners WHERE active=1 ORDER BY id DESC').all()));

// ---------- Products ----------
const RATING = `(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=p.id) rating,(SELECT COUNT(*) FROM reviews WHERE product_id=p.id) reviews`;
const SORTS = {
  new: 'p.id DESC', low: 'p.price ASC', high: 'p.price DESC', rating: 'rating DESC, reviews DESC, p.id DESC',
  discount: 'CASE WHEN p.old_price>p.price THEN (p.old_price-p.price)/p.old_price ELSE 0 END DESC, p.id DESC'
};
app.get('/api/products', (req, res) => {
  const { q = '', category = '', cat, sort = 'new', min, max, stock, rating, deal, page = 1 } = req.query;
  const w = ['p.active=1'], a = [];
  if (q) { const l = lk(q); w.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR p.category LIKE ? ESCAPE '\\')"); a.push(l, l, l, l); }
  if (category) { w.push('p.category=?'); a.push(String(category)); }
  if (+cat > 0 && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='categories'").get()) {
    const ids = db.prepare('WITH RECURSIVE descendants(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id=d.id) SELECT id FROM descendants').all(+cat).map(x => x.id);
    if (ids.length) {
      const marks = ids.map(() => '?').join(',');
      w.push(`(p.cat_id IN (${marks}) OR p.sub_id IN (${marks}) OR p.child_id IN (${marks}))`); a.push(...ids, ...ids, ...ids);
    } else w.push('0=1');
  }
  if (+min > 0) { w.push('p.price>=?'); a.push(+min); }
  if (+max > 0) { w.push('p.price<=?'); a.push(+max); }
  if (stock === '1') w.push('p.stock>0');
  if (deal === '1') w.push('p.old_price>p.price');
  if (+rating > 0) { w.push('COALESCE((SELECT AVG(rating) FROM reviews WHERE product_id=p.id),0)>=?'); a.push(+rating); }
  const where = w.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM products p WHERE ${where}`).get(...a).c;
  const pg = Math.min(1000, Math.max(1, Math.floor(+page) || 1));
  const items = db.prepare(`SELECT p.*,${RATING} FROM products p WHERE ${where} ORDER BY ${SORTS[sort] || SORTS.new} LIMIT 12 OFFSET ?`)
    .all(...a, (pg - 1) * 12).map(withImg);
  res.json({ items, total });
});
app.get('/api/categories', (req, res) => {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='categories'").get())
    return res.json(db.prepare("SELECT c.name category,COUNT(p.id) n,c.show_home home,c.show_menu menu FROM categories c LEFT JOIN products p ON p.active=1 AND (p.cat_id=c.id OR (p.cat_id IS NULL AND p.category=c.name)) WHERE c.parent_id IS NULL AND c.active=1 GROUP BY c.id ORDER BY c.sort,c.id").all());
  res.json(db.prepare("SELECT category,COUNT(*) n FROM products WHERE active=1 AND category<>'' GROUP BY category ORDER BY category").all());
});
app.get('/api/products/by-ids', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 40);
  if (!ids.length) return res.json([]);
  const rows = db.prepare(`SELECT p.*,${RATING} FROM products p WHERE p.active=1 AND p.id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(withImg);
  res.json(ids.map(i => rows.find(r => r.id === i)).filter(Boolean));
});
app.get('/api/products/:id', (req, res) => {
  const p = db.prepare(`SELECT p.*,${RATING} FROM products p WHERE p.id=? AND p.active=1`).get(+req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  withImg(p);
  p.variants = variantOps.list(p.id, false);
  p.reviewList = db.prepare('SELECT r.rating,r.comment,r.created,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.id DESC').all(p.id);
     p.reviewList.forEach(r => { r.name = String(r.name).split(' ')[0]; });
  p.related = db.prepare(`SELECT p.*,${RATING} FROM products p WHERE p.active=1 AND p.id<>? AND p.category=? ORDER BY p.id DESC LIMIT 4`).all(p.id, p.category).map(withImg);
  p.canReview = false;
  if (req.session.uid) {
    const ok = db.prepare("SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=? AND i.product_id=? AND o.status='Delivered'").get(req.session.uid, p.id);
    const done = db.prepare('SELECT 1 FROM reviews WHERE product_id=? AND user_id=?').get(p.id, req.session.uid);
    p.canReview = !!ok && !done;
  }
  res.json(p);
});

// ---------- Pricing (server e sob hishab) ----------
function couponCheck(code, sub) {
  if (!code) return null;
  const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(String(code).trim().toUpperCase());
  if (!c || !c.active) throw new Error('Invalid coupon code');
  if (c.expires && c.expires < new Date().toISOString().slice(0, 10)) throw new Error('This coupon has expired');
  if (c.max_uses > 0 && c.used >= c.max_uses) throw new Error('This coupon has reached its usage limit');
  if (sub < c.min_order) throw new Error('Minimum order of ৳' + c.min_order + ' required for this coupon');
  const d = c.type === 'percent' ? Math.round(sub * c.value / 100) : c.value;
  return { code: c.code, discount: Math.min(d, sub) };
}
function shipFor(amount, area) {
  const s = S(), free = +s.free_ship;
  if (free > 0 && amount >= free) return 0;
  return +(area === 'outside' ? s.ship_outside : s.ship_dhaka) || 0;
}
// Register variant-aware endpoints before the legacy-compatible cart/order routes.
const orderEmail = require('./order-email')(app, db, { need, admin, port: +process.env.PORT || 3000, testLimit: mkLimit(5, 15 * 60 * 1000), retryLimit: mkLimit(20, 15 * 60 * 1000) });
const variantOps = require('./variants')(app, db, { couponCheck, shipFor, PAYS, PHONE, np, orderLimit, addGuest, withImg, enqueueOrderEmail: orderEmail.enqueue, scheduleOrderEmail: orderEmail.schedule });
app.post('/api/cart/preview', (req, res) => {
  const b = req.body || {}, lines = [];
  for (const i of (Array.isArray(b.items) ? b.items : []).slice(0, 50)) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+i.id);
    if (!p || p.stock < 1) continue;
    withImg(p);
    lines.push({ id: p.id, name: p.name, image: p.image, price: p.price, stock: p.stock, qty: Math.max(1, Math.min(Math.floor(+i.qty) || 1, p.stock)) });
  }
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  let cp = null, couponError = null;
  if (b.coupon && lines.length) { try { cp = couponCheck(b.coupon, subtotal); } catch (e) { couponError = e.message; } }
  const discount = cp ? cp.discount : 0;
  const shipping = lines.length ? shipFor(subtotal - discount, b.area) : 0;
  res.json({ lines, subtotal, discount, coupon: cp && cp.code, couponError, shipping, total: subtotal - discount + shipping });
});

// ---------- Orders (guest checkout supported) ----------
function cancelOrder(o) {
  db.prepare('SELECT product_id,qty,variant_id FROM order_items WHERE order_id=?').all(o.id).forEach(i => {
    if (i.variant_id) variantOps.restock(i);
    else db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id);
  });
  if (o.coupon) db.prepare('UPDATE coupons SET used=MAX(used-1,0) WHERE code=?').run(o.coupon);
  db.prepare("UPDATE orders SET status='Cancelled' WHERE id=?").run(o.id);
  db.prepare('INSERT INTO order_events(order_id,status) VALUES(?,?)').run(o.id, 'Cancelled');
}
app.post('/api/orders', orderLimit, (req, res) => {
  const { items, name, address, area, idem, coupon, note, pay = 'cod', trx } = req.body || {};
  const phone = np((req.body || {}).phone);
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!String(name || '').trim() || !String(address || '').trim() || !PHONE.test(phone) || !['dhaka', 'outside'].includes(area) || !idem || String(idem).length > 80 || !PAYS[pay])
    return res.status(400).json({ error: 'Please enter a valid name, phone, area and address' });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address or leave it blank' });
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
        const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(+i.id);
        const q = Math.floor(+i.qty);
        if (!p || !(q > 0) || q > 99) throw new Error('A product in your cart is no longer available');
        const r = db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(q, p.id, q);
        if (!r.changes) throw new Error(p.name + ' does not have enough stock');
        sub += p.price * q; rows.push([p.id, p.name, p.price, q]);
      }
      const cp = couponCheck(coupon, sub);
      if (cp && !db.prepare('UPDATE coupons SET used=used+1 WHERE code=? AND (max_uses=0 OR used<max_uses)').run(cp.code).changes)
        throw new Error('This coupon has reached its usage limit');
      const disc = cp ? cp.discount : 0, ship = shipFor(sub - disc, area);
      db.prepare('INSERT INTO orders(id,user_id,name,phone,email,address,subtotal,shipping,total,idem,discount,coupon,note,area,payment,payment_status,trx) VALUES(@id,@uid,@name,@phone,@email,@address,@sub,@ship,@total,@idem,@disc,@coupon,@note,@area,@payment,@ps,@trx)')
        .run({ id: oid, uid: req.session.uid || null, name: String(name).trim().slice(0, 80), phone, email: email || null, address: String(address).trim().slice(0, 500), sub, ship, total: sub - disc + ship, idem: String(idem), disc, coupon: cp ? cp.code : null, note: String(note || '').slice(0, 300), area, payment: PAYS[pay], ps: pay === 'cod' ? 'Unpaid' : 'Verifying', trx: pay === 'cod' ? null : t });
      rows.forEach(r => db.prepare('INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES(?,?,?,?,?)').run(oid, ...r));
      db.prepare('INSERT INTO order_events(order_id,status) VALUES(?,?)').run(oid, 'Pending');
      orderEmail.enqueue(oid);
      return oid;
    })();
    if (!req.session.uid) addGuest(req, id);
    orderEmail.schedule(id);
    res.json({ id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Guest tracking: order ID + phone diye
app.post('/api/orders/track', trackLimit, (req, res) => {
  const { id, phone } = req.body || {};
  const o = db.prepare('SELECT id,phone,user_id FROM orders WHERE id=?').get(String(id || '').trim().toUpperCase());
  if (!o || np(o.phone) !== np(phone)) return res.status(404).json({ error: 'No order found with this ID and phone number' });
  if (!req.session.uid) addGuest(req, o.id);
  res.json({ id: o.id });
});
app.get('/api/orders', need, (req, res) =>
  res.json(db.prepare('SELECT id,total,status,created FROM orders WHERE user_id=? ORDER BY created DESC,rowid DESC').all(req.session.uid)));
app.get('/api/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o || !(mine(req, o) || isAdmin(req))) return res.status(404).json({ error: 'Order not found' });
  delete o.idem;
  delete o.email; // contact email is visible only in the admin order list
  o.items = db.prepare('SELECT name,price,qty,variant,sku FROM order_items WHERE order_id=?').all(o.id);
  o.events = db.prepare('SELECT status,created FROM order_events WHERE order_id=? ORDER BY id').all(o.id);
  res.json(o);
});
app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    db.transaction(() => {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
      if (!mine(req, o)) throw new Error('Order not found');
      if (!['Pending', 'Confirmed'].includes(o.status)) throw new Error('This order can no longer be cancelled');
      cancelOrder(o);
    })();
    res.json({ ok: 1 });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- Reviews ----------
app.post('/api/products/:id/reviews', need, (req, res) => {
  const { rating, comment } = req.body || {};
  const pid = +req.params.id, r = Math.floor(+rating);
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Please choose a rating from 1 to 5' });
  const ok = db.prepare("SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=? AND i.product_id=? AND o.status='Delivered'").get(req.session.uid, pid);
  if (!ok) return res.status(403).json({ error: 'Only customers with a delivered order can review this product' });
  try {
    db.prepare('INSERT INTO reviews(product_id,user_id,rating,comment) VALUES(?,?,?,?)').run(pid, req.session.uid, r, String(comment || '').slice(0, 1000));
    res.json({ ok: 1 });
  } catch (e) { res.status(400).json({ error: 'You have already reviewed this product' }); }
});

// ---------- Admin ----------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[f.mimetype])
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 6 },
  fileFilter: (req, f, cb) => cb(null, !!EXT[f.mimetype])
});
// file er asol content check (shudhu mimetype na)
const sig = f => {
  try {
    const b = Buffer.alloc(12), fd = fs.openSync(f.path, 'r'); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
    return (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP');
  } catch { return false; }
};
const files = req => req.files || (req.file ? [req.file] : []);
const drop = req => files(req).forEach(f => fs.unlink(f.path, () => { }));
let catalog;
const checkImgs = (req, res, next) => files(req).every(sig) ? next() : (drop(req), res.status(400).json({ error: 'Only real JPG/PNG/WebP images are allowed' }));
catalog = require('./features')(app, db, { need, admin, upload, checkImgs, drop });
app.post('/api/admin/logo', need, admin, upload.single('image'), checkImgs, (req, res) => {
  const b = req.body || {}, intent = b.intent === 'settings' ? 'settings' : 'upload';
  if (intent === 'upload' && !req.file) return res.status(400).json({ error: 'Choose a valid JPG, PNG or WebP image under 3MB.' });
  if ('logo_position' in b && !['left', 'right'].includes(String(b.logo_position))) { if (req.file) drop(req); return res.status(400).json({ error: 'Choose left or right for logo position.' }); }
  if ('logo_bg_opacity' in b && (!Number.isFinite(+b.logo_bg_opacity) || +b.logo_bg_opacity < 0 || +b.logo_bg_opacity > 100)) { if (req.file) drop(req); return res.status(400).json({ error: 'Logo background opacity must be between 0 and 100.' }); }
  const url = req.file ? '/uploads/' + req.file.filename : null;
  const put = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.transaction(() => {
    if (url) put.run('logo_url', url);
    if ('logo_position' in b) put.run('logo_position', String(b.logo_position));
    if ('logo_bg_opacity' in b) put.run('logo_bg_opacity', String(Math.round(+b.logo_bg_opacity)));
  })();
  res.json({ ok: 1, url: url || db.prepare("SELECT value FROM settings WHERE key='logo_url'").get()?.value || '', logo_position: b.logo_position || db.prepare("SELECT value FROM settings WHERE key='logo_position'").get()?.value || 'left', logo_bg_opacity: b.logo_bg_opacity ?? db.prepare("SELECT value FROM settings WHERE key='logo_bg_opacity'").get()?.value ?? '0' });
});
const pf = b => [String(b.name || '').trim().slice(0, 200), String(b.category || '').trim().slice(0, 60), String(b.brand || '').trim().slice(0, 60), catalog.sku(b.sku, b.name, b.id),
  String(b.description || '').slice(0, 5000), +b.price, (+b.old_price > +b.price) ? +b.old_price : null, Math.floor(+b.stock)];
const validP = b => String(b.name || '').trim() && Number.isFinite(+b.price) && +b.price > 0 &&
  Number.isFinite(+b.stock) && Number.isInteger(+b.stock) && +b.stock >= 0 && +b.stock <= 1e6;
const safeLink = l => /^(#\/|\/|https?:\/\/)/i.test(String(l || '').trim()) ? String(l).trim().slice(0, 300) : '';
const BD = "'+6 hours'"; // Bangladesh time (UTC+6)

app.get('/api/admin/stats', need, admin, (req, res) => {
  const n = [7, 30, 90].includes(+req.query.days) ? +req.query.days : 7;
  const since = '-' + (n - 1) + ' days';
  const g = (sql, ...a) => db.prepare(sql).get(...a).v;
  const rows = db.prepare(`SELECT date(created,${BD}) d,SUM(total) v,COUNT(*) c FROM orders WHERE status<>'Cancelled' AND date(created,${BD})>=date('now',${BD},?) GROUP BY d`).all(since);
  const chart = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() + 6 * 36e5 - i * 864e5).toISOString().slice(0, 10), r = rows.find(x => x.d === d);
    chart.push({ d, v: r ? r.v : 0, c: r ? r.c : 0 });
  }
  const today = chart[chart.length - 1];
  res.json({
    days: n, chart, todayRevenue: today.v, todayOrders: today.c,
    rangeRevenue: chart.reduce((a, x) => a + x.v, 0), rangeOrders: chart.reduce((a, x) => a + x.c, 0),
    revenue: g("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status<>'Cancelled'"),
    orders: g('SELECT COUNT(*) v FROM orders'),
    pending: g("SELECT COUNT(*) v FROM orders WHERE status='Pending'"),
    verify: g("SELECT COUNT(*) v FROM orders WHERE payment_status='Verifying' AND status<>'Cancelled'"),
    customers: g("SELECT COUNT(*) v FROM users WHERE role='customer'"),
    products: g('SELECT COUNT(*) v FROM products WHERE active=1'),
    outOfStock: g('SELECT COUNT(*) v FROM products WHERE active=1 AND stock<1'),
    lowStock: db.prepare('SELECT id,name,stock FROM products WHERE active=1 AND stock<=5 ORDER BY stock LIMIT 10').all(),
    top: db.prepare(`SELECT i.name,SUM(i.qty) q,SUM(i.qty*i.price) v FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status<>'Cancelled' AND date(o.created,${BD})>=date('now',${BD},?) GROUP BY i.product_id ORDER BY q DESC LIMIT 5`).all(since),
    recent: db.prepare('SELECT id,name,total,status,payment,payment_status,created FROM orders ORDER BY created DESC,rowid DESC LIMIT 6').all()
  });
});
app.get('/api/admin/products', need, admin, (req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(p => {
  withImg(p); p.variants = variantOps.list(p.id, true); return p;
})));
app.post('/api/admin/products', need, admin, upload.array('images', 6), checkImgs, (req, res) => {
  if (!validP(req.body)) { drop(req); return res.status(400).json({ error: 'Please enter a valid name, price and stock' }); }
  try {
    const chain = catalog.resolve(req.body), imgs = (req.files || []).map(f => '/uploads/' + f.filename);
    const id = db.transaction(() => {
      const r = db.prepare('INSERT INTO products(name,category,brand,sku,description,price,old_price,stock,image,images) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(...pf(req.body), imgs[0] || null, JSON.stringify(imgs));
      catalog.setCat(r.lastInsertRowid, chain); variantOps.saveExtras(r.lastInsertRowid, req.body); return r.lastInsertRowid;
    })(); res.json({ ok: 1, id });
  } catch (e) { drop(req); res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/products/:id', need, admin, upload.array('images', 6), checkImgs, (req, res) => {
  if (!validP(req.body)) { drop(req); return res.status(400).json({ error: 'Please enter a valid name, price and stock' }); }
  try {
    const id = +req.params.id, chain = catalog.resolve(req.body), imgs = (req.files || []).map(f => '/uploads/' + f.filename);
    const changed = db.transaction(() => {
      const old = db.prepare('SELECT has_variants FROM products WHERE id=?').get(id); if (!old) throw new Error('Product not found');
      const values = pf({ ...req.body, id });
      if (old.has_variants && !(req.body.has_variants === '1' || req.body.has_variants === 1)) values[7] = +req.body.stock;
      db.prepare('UPDATE products SET name=?,category=?,brand=?,sku=?,description=?,price=?,old_price=?,stock=? WHERE id=?').run(...values, id);
      catalog.setCat(id, chain); variantOps.saveExtras(id, req.body);
      if (imgs.length) db.prepare('UPDATE products SET image=?,images=? WHERE id=?').run(imgs[0], JSON.stringify(imgs), id);
      return true;
    })(); res.json({ ok: changed });
  } catch (e) { drop(req); res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/products/:id/stock', need, admin, (req, res) => {
  if (variantOps.hasVariants(+req.params.id)) return res.status(400).json({ error: 'This product tracks stock by variant. Edit stock in the variant table.' });
  const s = Math.floor(+(req.body || {}).stock);
  if (!(s >= 0 && s <= 1e6)) return res.status(400).json({ error: 'Enter a valid stock quantity' });
  db.prepare('UPDATE products SET stock=? WHERE id=?').run(s, +req.params.id); res.json({ ok: 1 });
});
app.post('/api/admin/products/:id/toggle', need, admin, (req, res) => {
  db.prepare('UPDATE products SET active=1-active WHERE id=?').run(+req.params.id); res.json({ ok: 1 });
});
app.delete('/api/admin/products/:id', need, admin, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM reviews WHERE product_id=?').run(+req.params.id);
    db.prepare('DELETE FROM products WHERE id=?').run(+req.params.id);
  })();
  res.json({ ok: 1 });
});

function adminOrders(req) {
  const { status = '', q = '', ps = '' } = req.query, w = ['1=1'], a = [];
  if (STATUSES.includes(status)) { w.push('status=?'); a.push(status); }
  if (PSTAT.includes(ps)) { w.push('payment_status=?'); a.push(ps); }
  if (q) { const l = lk(q); w.push("(id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR trx LIKE ? ESCAPE '\\')"); a.push(l, l, l, l, l); }
  const list = db.prepare(`SELECT * FROM orders WHERE ${w.join(' AND ')} ORDER BY created DESC,rowid DESC LIMIT 300`).all(...a);
  list.forEach(o => { delete o.idem; o.guest = !o.user_id; o.items = db.prepare('SELECT name,price,qty,variant,sku FROM order_items WHERE order_id=?').all(o.id); o.email_notification = db.prepare('SELECT status,attempts,last_attempt_at,sent_at,last_error FROM order_email_notifications WHERE order_id=?').get(o.id) || { status: 'Unavailable', attempts: 0 }; });
  return list;
}
app.get('/api/admin/orders', need, admin, (req, res) => res.json(adminOrders(req)));
app.get('/api/admin/orders.csv', need, admin, (req, res) => {
  const c = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [['Order', 'Date(BD)', 'Status', 'Customer', 'Phone', 'Email', 'Address', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Payment', 'Payment status', 'TrxID', 'Tracking', 'Note'].map(c).join(',')];
  adminOrders(req).forEach(o => rows.push([o.id, new Date(String(o.created).replace(' ', 'T') + 'Z').toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }), o.status, o.name, o.phone, o.email, o.address, o.items.map(i => i.name + ' x' + i.qty).join('; '), o.subtotal, o.discount || 0, o.shipping, o.total, o.payment, o.payment_status, o.trx, o.tracking, o.note].map(c).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
  res.send('\ufeff' + rows.join('\n'));
});
app.post('/api/admin/orders/:id', need, admin, (req, res) => {
  const { status, tracking, payment_status } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (payment_status !== undefined && !PSTAT.includes(payment_status)) return res.status(400).json({ error: 'Invalid payment status' });
  try {
    db.transaction(() => {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
      if (!o) throw new Error('Order not found');
      if (payment_status && o.status !== 'Cancelled') db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(payment_status, o.id);
      if (!status || status === o.status && tracking === undefined) return;
      if (['Cancelled', 'Delivered'].includes(o.status)) throw new Error('This order can no longer be changed');
      if (status === 'Cancelled') return cancelOrder(o);
      db.prepare('UPDATE orders SET status=?,tracking=? WHERE id=?').run(status, String(tracking ?? o.tracking ?? '').slice(0, 100), o.id);
      if (status === 'Delivered' && o.payment === 'Cash on Delivery') db.prepare("UPDATE orders SET payment_status='Paid' WHERE id=?").run(o.id);
      if (status !== o.status) db.prepare('INSERT INTO order_events(order_id,status) VALUES(?,?)').run(o.id, status);
    })();
    res.json({ ok: 1 });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/admin/customers', need, admin, (req, res) =>
  res.json(db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.created,
    (SELECT COUNT(*) FROM orders WHERE user_id=u.id) orders,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE user_id=u.id AND status<>'Cancelled') spent
    FROM users u WHERE u.role='customer' ORDER BY u.created DESC`).all()));
app.post('/api/admin/password', need, admin, limit, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT hash FROM users WHERE id=?').get(req.session.uid);
  if (!u || !bcrypt.compareSync(String(current || ''), u.hash)) return res.status(400).json({ error: 'Current password is wrong' });
  if (String(next || '').length < 14) return res.status(400).json({ error: 'New password must be at least 14 characters' });
  db.prepare('UPDATE users SET hash=? WHERE id=?').run(bcrypt.hashSync(String(next), 12), req.session.uid);
  res.json({ ok: 1 });
});

app.get('/api/admin/coupons', need, admin, (req, res) => res.json(db.prepare('SELECT * FROM coupons ORDER BY created DESC').all()));
app.post('/api/admin/coupons', need, admin, (req, res) => {
  const b = req.body || {}, code = String(b.code || '').trim().toUpperCase();
  const type = b.type === 'fixed' ? 'fixed' : 'percent', value = +b.value;
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return res.status(400).json({ error: 'Code must be 3-20 letters/numbers' });
  if (!(value > 0) || (type === 'percent' && value > 100)) return res.status(400).json({ error: 'Enter a valid discount value' });
  const exp = /^\d{4}-\d{2}-\d{2}$/.test(b.expires || '') ? b.expires : null;
  try {
    db.prepare('INSERT INTO coupons(code,type,value,min_order,max_uses,expires) VALUES(?,?,?,?,?,?)')
      .run(code, type, value, Math.max(0, +b.min_order || 0), Math.max(0, Math.floor(+b.max_uses) || 0), exp);
    res.json({ ok: 1 });
  } catch (e) { res.status(400).json({ error: 'This coupon code already exists' }); }
});
app.post('/api/admin/coupons/:code/toggle', need, admin, (req, res) => {
  db.prepare('UPDATE coupons SET active=1-active WHERE code=?').run(req.params.code); res.json({ ok: 1 });
});
app.delete('/api/admin/coupons/:code', need, admin, (req, res) => {
  db.prepare('DELETE FROM coupons WHERE code=?').run(req.params.code); res.json({ ok: 1 });
});

app.get('/api/admin/banners', need, admin, (req, res) => res.json(db.prepare('SELECT * FROM banners ORDER BY id DESC').all()));
app.post('/api/admin/banners', need, admin, upload.single('image'), checkImgs, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Banner image is required (JPG/PNG/WebP, max 3MB)' });
  const b = req.body || {};
  db.prepare('INSERT INTO banners(title,subtitle,link,image) VALUES(?,?,?,?)')
    .run(String(b.title || '').slice(0, 100), String(b.subtitle || '').slice(0, 200), safeLink(b.link), '/uploads/' + req.file.filename);
  res.json({ ok: 1 });
});
app.post('/api/admin/banners/:id/toggle', need, admin, (req, res) => {
  db.prepare('UPDATE banners SET active=1-active WHERE id=?').run(+req.params.id); res.json({ ok: 1 });
});
app.delete('/api/admin/banners/:id', need, admin, (req, res) => {
  db.prepare('DELETE FROM banners WHERE id=?').run(+req.params.id); res.json({ ok: 1 });
});

const NUM = ['ship_dhaka', 'ship_outside', 'free_ship'];
app.post('/api/admin/settings', need, admin, (req, res) => {
  const b = req.body || {};
  for (const k of NUM) if (k in b && (!(+b[k] >= 0) || +b[k] > 100000)) return res.status(400).json({ error: 'Shipping values must be valid numbers' });
  if ('logo_position' in b && !['left', 'right'].includes(String(b.logo_position))) return res.status(400).json({ error: 'Choose left or right for logo position.' });
  if ('logo_bg_opacity' in b && (!Number.isFinite(+b.logo_bg_opacity) || +b.logo_bg_opacity < 0 || +b.logo_bg_opacity > 100)) return res.status(400).json({ error: 'Logo background opacity must be between 0 and 100.' });
  if ('logo_url' in b && b.logo_url && !/^\/uploads\/[a-f0-9]{24}\.(?:jpg|png|webp)$/i.test(String(b.logo_url))) return res.status(400).json({ error: 'Upload the logo image using the logo upload control.' });
  for (const k of ['facebook', 'instagram']) if (b[k] && !/^https?:\/\//i.test(String(b[k]).trim())) return res.status(400).json({ error: 'Facebook/Instagram link must start with https://' });
  for (const k of ['bkash', 'nagad', 'rocket']) {
    if (b[k] && !PHONE.test(np(String(b[k]).trim()))) return res.status(400).json({ error: k + ' number must be a valid BD number (01XXXXXXXXX)' });
    const enabled = b[k + '_enabled'];
    if (enabled !== undefined && !['0', '1', ''].includes(String(enabled))) return res.status(400).json({ error: 'Invalid payment method setting' });
    if (String(enabled) === '1' && !PHONE.test(np(String(b[k] || '').trim()))) return res.status(400).json({ error: 'Set a valid BD number before enabling ' + k });
  }
     for (const k of Object.keys(DEF)) if ((k.startsWith('c_') || k.startsWith('o_')) && k in b && String(b[k]).trim() !== '' && !/^#[0-9a-fA-F]{6}$/.test(String(b[k]).trim())) return res.status(400).json({ error: 'Invalid color value' });
  const up = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
  db.transaction(() => {
    for (const k of Object.keys(DEF)) if (k in b) {
      let v = String(b[k] ?? '').trim().slice(0, 8000);
      if (k === 'whatsapp') v = v.replace(/[^\d]/g, '');
      if (k === 'bkash' || k === 'nagad' || k === 'rocket') v = np(v);
      if (NUM.includes(k)) v = String(+v);
      if (k === 'logo_bg_opacity') v = String(Math.round(+v));
      if (k === 'logo_position') v = v === 'right' ? 'right' : 'left';
      if (k === 'store_name' && !v) v = 'My Shop';
      up.run(k, v);
    }
  })();
  res.json({ ok: 1 });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be under 3MB' : 'Request failed. Please check your input.' });
});
const PORT = +process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const ip = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
  console.log(`Website: http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin.html`);
  if (ip) console.log(`Phone theke (same WiFi): http://${ip.address}:${PORT}`);
});
