'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const originalEnv = Object.fromEntries(['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'PUBLIC_URL'].map(k => [k, process.env[k]]));
function smtpEnv() {
  Object.assign(process.env, { SMTP_HOST: 'smtp.test.invalid', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'user', SMTP_PASS: 'test-only-secret', MAIL_FROM: 'orders@example.test', PUBLIC_URL: 'https://shop.example.test' });
}
function fakeApp() {
  const routes = new Map();
  const add = method => (path, ...handlers) => routes.set(`${method} ${path}`, handlers);
  return { routes, get: add('GET'), post: add('POST') };
}
function auth(req, res, next) { return req.authenticated ? next() : res.status(401).json({ error: 'Unauthorized' }); }
function admin(req, res, next) { return req.isAdmin ? next() : res.status(403).json({ error: 'Admin only' }); }
function invoke(handlers, req = {}) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, status(n) { this.code = n; return this; }, json(body) { resolve({ status: this.code, body }); } };
    let i = 0;
    const next = error => { if (error) return reject(error); const h = handlers[i++]; if (!h) return resolve({ status: res.code }); try { const result = h(req, res, next); if (result?.then) result.catch(reject); } catch (e) { reject(e); } };
    next();
  });
}
function baseDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT,phone TEXT,email TEXT,address TEXT,subtotal REAL,shipping REAL,total REAL,status TEXT DEFAULT 'Pending',payment TEXT DEFAULT 'Cash on Delivery',idem TEXT UNIQUE,tracking TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,discount REAL DEFAULT 0,coupon TEXT,note TEXT,area TEXT,payment_status TEXT DEFAULT 'Unpaid',trx TEXT);
    CREATE TABLE order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,product_id INTEGER,name TEXT,price REAL,qty INTEGER,variant_id INTEGER,variant TEXT,sku TEXT);
    INSERT INTO settings(key,value) VALUES('store_name','Shop <One>');`);
  return db;
}
test('email recipient validation, admin access, secret-free settings, and test email', async t => {
  smtpEnv(); const db = baseDb(), app = fakeApp(), sent = [];
  t.after(() => { db.close(); for (const [k, v] of Object.entries(originalEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  const service = require('../order-email')(app, db, { need: auth, admin, runWorker: false, transportFactory: () => ({ sendMail: async mail => { sent.push(mail); return { accepted: [mail.to] }; } }) });
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  let r = await invoke(app.routes.get('GET /api/admin/order-email'), {});
  assert.equal(r.status, 401);
  r = await invoke(app.routes.get('POST /api/admin/order-email'), { authenticated: true, isAdmin: true, body: { recipient: 'bad-address', enabled: true } });
  assert.equal(r.status, 400);
  r = await invoke(app.routes.get('POST /api/admin/order-email'), { authenticated: true, isAdmin: true, body: { recipient: 'owner@example.test', enabled: true } });
  assert.equal(r.body.enabled, true);
  assert.equal(JSON.stringify(r.body).includes('test-only-secret'), false);
  r = await invoke(app.routes.get('POST /api/admin/order-email/test'), { authenticated: true, isAdmin: true, body: {} });
  assert.equal(r.body.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(service.status().smtpConfigured, true);
});

test('variant guest checkout queues exactly one email after a committed successful order', async t => {
  smtpEnv(); const db = baseDb(), app = fakeApp(), sent = [], guest = [];
  t.after(() => { db.close(); for (const [k, v] of Object.entries(originalEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,category TEXT,brand TEXT,sku TEXT,description TEXT,price REAL,old_price REAL,stock INTEGER,image TEXT,images TEXT,active INTEGER DEFAULT 1,created TEXT DEFAULT CURRENT_TIMESTAMP,has_variants INTEGER DEFAULT 0,desc_table TEXT);
    CREATE TABLE coupons(code TEXT PRIMARY KEY,type TEXT,value REAL,min_order REAL DEFAULT 0,max_uses INTEGER DEFAULT 0,used INTEGER DEFAULT 0,expires TEXT,active INTEGER DEFAULT 1);
    INSERT INTO products(id,name,sku,price,stock,active,has_variants) VALUES(1,'T-shirt','TSHIRT',800,3,1,1);
    CREATE TABLE order_events(id INTEGER PRIMARY KEY,order_id TEXT,status TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO settings(key,value) VALUES('order_email_enabled','1'),('order_email_recipient','owner@example.test');`);
  const service = require('../order-email')(app, db, { need: auth, admin, runWorker: false, transportFactory: () => ({ sendMail: async mail => { sent.push(mail); return { accepted: [mail.to] }; } }) });
  require('../variants')(app, db, { couponCheck: () => null, shipFor: () => 60, PAYS: { cod: 'Cash on Delivery' }, PHONE: /^01[3-9]\d{8}$/, np: x => x, orderLimit: (_q, _s, n) => n(), addGuest: (_q, id) => { if (!guest.includes(id)) guest.push(id); }, withImg: p => p, enqueueOrderEmail: service.enqueue, scheduleOrderEmail: service.schedule });
  db.prepare("INSERT INTO variants(product_id,name,sku,price,stock) VALUES(1,'Medium','TSHIRT-M',900,2)").run();
  const handler = app.routes.get('POST /api/orders').at(-1);
  const input = { items: [{ id: 1, v: 1, qty: 1 }], name: 'A <Buyer>', phone: '01712345678', email: 'buyer@example.test', address: 'House 4, Road 2, Dhaka', area: 'dhaka', idem: 'checkout-once', pay: 'cod', note: '<script>alert(1)</script>' };
  let r = await invoke([handler], { body: { ...input, address: '' } });
  assert.equal(r.status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_email_notifications').get().n, 0);
  r = await invoke([handler], { body: input, session: {} });
  assert.equal(r.status, 200);
  const orderId = r.body.id;
  assert.equal(db.prepare('SELECT email FROM orders WHERE id=?').get(orderId).email, 'buyer@example.test');
  assert.equal(db.prepare('SELECT status FROM order_email_notifications WHERE order_id=?').get(orderId).status, 'Pending');
  const duplicate = await invoke([handler], { body: input, session: {} });
  assert.equal(duplicate.body.id, orderId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_email_notifications').get().n, 1);
  for (let i = 0; i < 30 && !sent.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(sent.length, 1);
  assert.equal(db.prepare('SELECT status FROM order_email_notifications WHERE order_id=?').get(orderId).status, 'Sent');
  assert.equal(guest.length, 1);
  assert.match(sent[0].html, /&lt;Buyer&gt;/);
  assert.doesNotMatch(sent[0].html, /<script>alert/);
  assert.match(sent[0].html, /Medium/);
  assert.match(sent[0].html, /TSHIRT-M/);
  assert.match(sent[0].html, /৳960/);
  assert.match(sent[0].html, /https:\/\/shop\.example\.test\/admin\.html\?order=/);
});

test('failed SMTP does not alter the order and stops automatic retrying as Failed', async t => {
  smtpEnv(); const db = baseDb(), app = fakeApp();
  t.after(() => { db.close(); for (const [k, v] of Object.entries(originalEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  db.exec("INSERT INTO settings(key,value) VALUES('order_email_enabled','1'),('order_email_recipient','owner@example.test'); INSERT INTO orders(id,name,phone,address,subtotal,shipping,total,email) VALUES('ORD-1','A','01712345678','Dhaka',100,60,160,'buyer@example.test');");
  const service = require('../order-email')(app, db, { need: auth, admin, runWorker: false, transportFactory: () => ({ sendMail: async () => { throw Object.assign(new Error('private provider detail'), { code: 'EAUTH' }); } }) });
  db.transaction(() => service.enqueue('ORD-1'))();
  for (let i = 0; i < 5; i++) await service.deliver('ORD-1');
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get('ORD-1').status, 'Pending');
  const notification = db.prepare('SELECT status,attempts,last_error FROM order_email_notifications WHERE order_id=?').get('ORD-1');
  assert.equal(notification.status, 'Failed');
  assert.equal(notification.attempts, 5);
  assert.match(notification.last_error, /authentication failed/i);
  assert.doesNotMatch(notification.last_error, /private provider detail|test-only-secret/);
});

test('missing SMTP configuration is reported without attempting to send', async t => {
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k];
  const db = baseDb(), app = fakeApp();
  t.after(() => { db.close(); for (const [k, v] of Object.entries(originalEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  const service = require('../order-email')(app, db, { need: auth, admin, runWorker: false, transportFactory: () => { throw new Error('must not create SMTP'); } });
  assert.equal(service.status().smtpConfigured, false);
  db.exec("INSERT INTO settings(key,value) VALUES('order_email_enabled','1'),('order_email_recipient','owner@example.test');");
  const r = await invoke(app.routes.get('POST /api/admin/order-email/test'), { authenticated: true, isAdmin: true, body: {} });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /SMTP configuration/i);
});

test('failed notifications can be retried only by an admin; disabled orders remain disabled', async t => {
  smtpEnv(); const db = baseDb(), app = fakeApp(), sent = [];
  t.after(() => { db.close(); for (const [k, v] of Object.entries(originalEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  db.exec("INSERT INTO settings(key,value) VALUES('order_email_enabled','1'),('order_email_recipient','owner@example.test'); INSERT INTO orders(id,name,phone,address,subtotal,shipping,total) VALUES('ORD-RETRY','A','01712345678','Dhaka',100,60,160);");
  const service = require('../order-email')(app, db, { need: auth, admin, runWorker: false, transportFactory: () => ({ sendMail: async mail => { sent.push(mail); return { accepted: [mail.to] }; } }) });
  db.prepare("INSERT INTO order_email_notifications(order_id,status,attempts,last_error) VALUES('ORD-RETRY','Failed',5,'SMTP authentication failed.')").run();
  const route = app.routes.get('POST /api/admin/orders/:id/email');
  let r = await invoke(route, { params: { id: 'ORD-RETRY' }, body: {} });
  assert.equal(r.status, 401);
  r = await invoke(route, { authenticated: true, isAdmin: true, params: { id: 'ORD-RETRY' }, body: {} });
  assert.equal(r.body.ok, true);
  for (let i = 0; i < 30 && !sent.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(sent.length, 1);
  assert.equal(db.prepare('SELECT status FROM order_email_notifications WHERE order_id=?').get('ORD-RETRY').status, 'Sent');

  db.prepare("UPDATE settings SET value='0' WHERE key='order_email_enabled'").run();
  db.transaction(() => service.enqueue('ORD-RETRY'))();
  const disabledId = 'ORD-DISABLED';
  db.prepare("INSERT INTO orders(id,name,phone,address,subtotal,shipping,total) VALUES(?,'A','01712345678','Dhaka',100,60,160)").run(disabledId);
  db.transaction(() => service.enqueue(disabledId))();
  await service.deliver(disabledId);
  assert.equal(db.prepare('SELECT status FROM order_email_notifications WHERE order_id=?').get(disabledId).status, 'Disabled');
  assert.equal(sent.length, 1);
});

test('additive queue migration preserves existing notification rows', t => {
  const db = baseDb(), app = fakeApp();
  t.after(() => db.close());
  db.exec(`CREATE TABLE order_email_notifications(order_id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'Pending',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_attempt_at TEXT,sent_at TEXT,next_attempt_at TEXT,last_error TEXT);
    INSERT INTO order_email_notifications(order_id,status,attempts,last_error) VALUES('ORD-OLD','Failed',3,'SMTP timeout');`);
  require('../order-email')(app, db, { need: auth, admin, runWorker: false });
  const row = db.prepare('SELECT status,attempts,auto_attempts,last_error FROM order_email_notifications WHERE order_id=?').get('ORD-OLD');
  assert.deepEqual(row, { status: 'Failed', attempts: 3, auto_attempts: 0, last_error: 'SMTP timeout' });
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
});
