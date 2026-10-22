'use strict';

const nodemailer = require('nodemailer');
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const PRIVATE_KEYS = ['order_email_enabled', 'order_email_recipient'];
const MAX_ATTEMPTS = 5;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => '৳' + Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateBD = value => {
  const d = new Date(String(value || '').replace(' ', 'T') + 'Z');
  return Number.isNaN(+d) ? String(value || '') : d.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
};
const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.origin : ''; } catch { return ''; } };
const cleanError = error => {
  const code = String(error?.code || '');
  if (code === 'MAIL_CONFIG') return 'SMTP configuration is incomplete or invalid.';
  if (code.toUpperCase().includes('AUTH') || /auth/i.test(String(error?.message || ''))) return 'SMTP authentication failed. Check SMTP_USER and SMTP_PASS.';
  if (/ECONNECTION|ETIMEDOUT|ESOCKET|ECONNREFUSED|ENOTFOUND/.test(code)) return 'Could not connect to the SMTP server. Check host, port and security settings.';
  return 'Email provider did not accept the message. Check SMTP provider logs and configuration.';
};

module.exports = (app, db, { need, admin, port = 3000, transportFactory, runWorker = true, testLimit = (_req, _res, next) => next(), retryLimit = (_req, _res, next) => next() } = {}) => {
  db.exec(`CREATE TABLE IF NOT EXISTS order_email_notifications(
    order_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'Pending', attempts INTEGER NOT NULL DEFAULT 0, auto_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_attempt_at TEXT, sent_at TEXT,
    next_attempt_at TEXT, last_error TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_order_email_retry ON order_email_notifications(status,next_attempt_at);`);
  if (!db.prepare('PRAGMA table_info(order_email_notifications)').all().some(x => x.name === 'auto_attempts')) db.exec('ALTER TABLE order_email_notifications ADD COLUMN auto_attempts INTEGER NOT NULL DEFAULT 0');

  const getSetting = key => db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value || '';
  const setSetting = (key, value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
  const smtpConfig = () => {
    const host = String(process.env.SMTP_HOST || '').trim();
    const portNo = Number(process.env.SMTP_PORT || 0);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    const from = String(process.env.MAIL_FROM || '').trim();
    const secure = /^(1|true|yes)$/i.test(String(process.env.SMTP_SECURE || ''));
    if (!host || !Number.isInteger(portNo) || portNo < 1 || portNo > 65535 || !user || !pass || !EMAIL_RE.test(from)) {
      const e = new Error('SMTP configuration is incomplete or invalid.'); e.code = 'MAIL_CONFIG'; throw e;
    }
    return { host, port: portNo, secure, auth: { user, pass }, from };
  };
  const transporter = () => {
    const c = smtpConfig();
    return { transport: transportFactory ? transportFactory(c) : nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.auth, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 }), from: c.from };
  };
  const status = () => ({
    enabled: getSetting('order_email_enabled') === '1', recipient: getSetting('order_email_recipient'),
    smtpConfigured: (() => { try { smtpConfig(); return true; } catch { return false; } })(),
    publicUrlConfigured: !!safeUrl(process.env.PUBLIC_URL || '')
  });

  // Called inside the same SQLite transaction which creates order, items, stock and order event.
  const enqueue = orderId => {
    const enabled = getSetting('order_email_enabled') === '1';
    db.prepare(`INSERT OR IGNORE INTO order_email_notifications(order_id,status) VALUES(?,?)`).run(orderId, enabled ? 'Pending' : 'Disabled');
  };

  const buildMessage = order => {
    const shop = getSetting('store_name') || 'My Shop';
    const origin = safeUrl(process.env.PUBLIC_URL || '') || `http://localhost:${port}`;
    const adminLink = `${origin}/admin.html?order=${encodeURIComponent(order.id)}`;
    const esc = escapeHtml;
    const rows = order.items.map(item => {
      const label = `${item.name}${item.variant && !String(item.name).includes(item.variant) ? ` (${item.variant})` : ''}`;
      return `<tr><td style="padding:12px 8px;border-bottom:1px solid #e8eaf0">${esc(label)}${item.sku ? `<br><small style="color:#788096">SKU: ${esc(item.sku)}</small>` : ''}</td><td style="padding:12px 8px;text-align:center;border-bottom:1px solid #e8eaf0">${Number(item.qty)}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8eaf0">${esc(money(item.price))}</td><td style="padding:12px 8px;text-align:right;border-bottom:1px solid #e8eaf0">${esc(money(item.price * item.qty))}</td></tr>`;
    }).join('');
    const customerEmail = order.email ? `<tr><td style="padding:5px 0;color:#687089">Email</td><td style="padding:5px 0">${esc(order.email)}</td></tr>` : '';
    const trx = order.trx ? `<tr><td style="padding:5px 0;color:#687089">Transaction reference</td><td style="padding:5px 0">${esc(order.trx)}</td></tr>` : '';
    const discount = Number(order.discount || 0) ? `<tr><td style="padding:5px 0;color:#687089">Discount${order.coupon ? ` (${esc(order.coupon)})` : ''}</td><td style="padding:5px 0;text-align:right">−${esc(money(order.discount))}</td></tr>` : '';
    const note = order.note ? `<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:#fff8e8"><b>Customer note</b><br>${esc(order.note)}</div>` : '';
    const html = `<!doctype html><html><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#172033"><div style="max-width:720px;margin:24px auto;padding:0 12px"><div style="background:#fff;border:1px solid #e7eaf1;border-radius:16px;overflow:hidden"><div style="padding:24px;background:linear-gradient(120deg,#163b72,#6250bb);color:#fff"><div style="font-size:13px;opacity:.85">${esc(shop)}</div><h1 style="font-size:24px;margin:10px 0 4px">New Order Received</h1><div>Order ${esc(order.id)} · ${esc(dateBD(order.created))}</div></div><div style="padding:22px"><h2 style="font-size:17px;margin:0 0 10px">Customer & delivery</h2><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:5px 0;color:#687089;width:130px">Name</td><td style="padding:5px 0">${esc(order.name)}</td></tr><tr><td style="padding:5px 0;color:#687089">Phone</td><td style="padding:5px 0">${esc(order.phone)}</td></tr>${customerEmail}<tr><td style="padding:5px 0;color:#687089">Address</td><td style="padding:5px 0">${esc(order.address)}${order.area ? `<br>${esc(order.area === 'dhaka' ? 'Inside Dhaka' : order.area === 'outside' ? 'Outside Dhaka' : order.area)}` : ''}</td></tr></table><h2 style="font-size:17px;margin:22px 0 8px">Ordered products</h2><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f5f6fa"><th style="text-align:left;padding:10px 8px">Product / variant</th><th>Qty</th><th style="text-align:right">Unit price</th><th style="text-align:right">Line total</th></tr></thead><tbody>${rows}</tbody></table></div><table style="width:100%;max-width:360px;margin:16px 0 0 auto;border-collapse:collapse;font-size:14px"><tr><td style="padding:5px 0;color:#687089">Subtotal</td><td style="padding:5px 0;text-align:right">${esc(money(order.subtotal))}</td></tr>${discount}<tr><td style="padding:5px 0;color:#687089">Delivery</td><td style="padding:5px 0;text-align:right">${esc(money(order.shipping))}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #dfe3ec;font-weight:bold">Total payable</td><td style="padding:10px 0;border-top:1px solid #dfe3ec;text-align:right;font-weight:bold;font-size:18px">${esc(money(order.total))}</td></tr></table><div style="margin-top:18px;padding:14px;border-radius:10px;background:#f5f6fa;font-size:14px"><b>Payment</b><br>${esc(order.payment)} · ${esc(order.payment_status)}${trx ? `<table style="font-size:13px">${trx}</table>` : ''}</div>${note}<p style="margin:24px 0 4px"><a href="${esc(adminLink)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#5547b9;color:white;text-decoration:none;font-weight:bold">Open this order in Admin Panel</a></p></div></div><p style="text-align:center;color:#8a91a3;font-size:11px">Automated order notification from ${esc(shop)}.</p></div></body></html>`;
    const text = `${shop} — New Order Received\nOrder: ${order.id}\nDate: ${dateBD(order.created)}\nCustomer: ${order.name}\nPhone: ${order.phone}\n${order.email ? `Email: ${order.email}\n` : ''}Address: ${order.address}\nItems:\n${order.items.map(i => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x ${i.qty} @ ${money(i.price)} = ${money(i.price * i.qty)}`).join('\n')}\nSubtotal: ${money(order.subtotal)}\nDelivery: ${money(order.shipping)}\nDiscount: ${money(order.discount)}\nTotal: ${money(order.total)}\nPayment: ${order.payment} (${order.payment_status})\n${order.trx ? `Transaction reference: ${order.trx}\n` : ''}${order.note ? `Note: ${order.note}\n` : ''}Admin: ${adminLink}`;
    return { html, text, adminLink, shop };
  };

  const deliver = async orderId => {
    const row = db.prepare('SELECT * FROM order_email_notifications WHERE order_id=?').get(orderId);
    if (!row || row.status !== 'Pending' || row.auto_attempts >= MAX_ATTEMPTS) return;
    const claim = db.prepare("UPDATE order_email_notifications SET status='Sending',attempts=attempts+1,auto_attempts=auto_attempts+1,last_attempt_at=CURRENT_TIMESTAMP,next_attempt_at=NULL,last_error=NULL WHERE order_id=? AND status='Pending'").run(orderId);
    if (!claim.changes) return;
    try {
      const recipient = getSetting('order_email_recipient');
      if (getSetting('order_email_enabled') !== '1') throw Object.assign(new Error('disabled'), { code: 'MAIL_DISABLED' });
      if (!EMAIL_RE.test(recipient)) throw Object.assign(new Error('invalid recipient'), { code: 'MAIL_CONFIG' });
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
      if (!order) throw new Error('missing order');
      order.items = db.prepare('SELECT name,price,qty,variant,sku FROM order_items WHERE order_id=?').all(orderId);
      const { transport, from } = transporter(), msg = buildMessage(order);
      const accepted = await transport.sendMail({ from, to: recipient, replyTo: order.email && EMAIL_RE.test(order.email) ? order.email : undefined, subject: `New order ${order.id} — ${msg.shop}`, text: msg.text, html: msg.html });
      if (!accepted || !Array.isArray(accepted.accepted) || !accepted.accepted.some(x => String(x).toLowerCase() === recipient.toLowerCase())) throw new Error('Recipient not accepted');
      db.prepare("UPDATE order_email_notifications SET status='Sent',sent_at=CURRENT_TIMESTAMP,last_error=NULL,next_attempt_at=NULL WHERE order_id=? AND status='Sending'").run(orderId);
    } catch (error) {
      const safe = error?.code === 'MAIL_DISABLED' ? 'Notifications are disabled.' : cleanError(error);
      const current = db.prepare('SELECT auto_attempts FROM order_email_notifications WHERE order_id=?').get(orderId);
      const attempts = current?.auto_attempts || MAX_ATTEMPTS;
      const retry = error?.code !== 'MAIL_DISABLED' && error?.code !== 'MAIL_CONFIG' && attempts < MAX_ATTEMPTS;
      const delay = Math.min(60, 2 ** Math.max(1, attempts)) * 60;
      db.prepare(`UPDATE order_email_notifications SET status=?,last_error=?,next_attempt_at=${retry ? "datetime('now',?)" : 'NULL'} WHERE order_id=? AND status='Sending'`)
        .run(retry ? 'Pending' : 'Failed', safe, ...(retry ? [`+${delay} seconds`] : []), orderId);
      console.warn(`[order-email] Notification delivery failed for ${String(orderId).slice(0, 40)}: ${safe}`);
    }
  };
  const schedule = orderId => setImmediate(() => { deliver(orderId).catch(() => {}); });
  const retryDue = () => {
    const ids = db.prepare("SELECT order_id FROM order_email_notifications WHERE status='Pending' AND (next_attempt_at IS NULL OR next_attempt_at<=CURRENT_TIMESTAMP) ORDER BY created_at LIMIT 20").all();
    ids.forEach(x => schedule(x.order_id));
  };
  // Recover work interrupted by process restart, then poll the durable SQLite queue.
  if (runWorker) {
    db.prepare("UPDATE order_email_notifications SET status=CASE WHEN auto_attempts>=5 THEN 'Failed' ELSE 'Pending' END,last_error='Delivery interrupted; retrying.' WHERE status='Sending'").run();
    const timer = setInterval(retryDue, 15000); timer.unref(); setImmediate(retryDue);
  }

  app.get('/api/admin/order-email', need, admin, (req, res) => {
    const s = status();
    res.json({ ...s, recipient: getSetting('order_email_recipient'), enabled: getSetting('order_email_enabled') === '1' });
  });
  app.post('/api/admin/order-email', need, admin, (req, res) => {
    const body = req.body || {}, recipient = String(body.recipient || '').trim().toLowerCase(), enabled = body.enabled === true || body.enabled === '1';
    if (recipient && (recipient.length > 254 || !EMAIL_RE.test(recipient))) return res.status(400).json({ error: 'Enter a valid recipient email address.' });
    if (enabled && !EMAIL_RE.test(recipient)) return res.status(400).json({ error: 'Set a valid recipient email before enabling notifications.' });
    db.transaction(() => {
      setSetting('order_email_recipient', recipient); setSetting('order_email_enabled', enabled ? '1' : '0');
      if (!enabled) db.prepare("UPDATE order_email_notifications SET status='Disabled',next_attempt_at=NULL,last_error=NULL WHERE status='Pending'").run();
    })();
    res.json({ ok: true, ...status() });
  });
  app.post('/api/admin/order-email/test', need, admin, testLimit, async (req, res) => {
    if (getSetting('order_email_enabled') !== '1') return res.status(400).json({ error: 'Enable order email notifications before sending a test.' });
    const recipient = getSetting('order_email_recipient');
    if (!EMAIL_RE.test(recipient)) return res.status(400).json({ error: 'Set a valid recipient email address first.' });
    try {
      const { transport, from } = transporter();
      const accepted = await transport.sendMail({ from, to: recipient, subject: `${getSetting('store_name') || 'My Shop'} — Test order notification`, text: 'SMTP test successful. Order email notifications are ready.', html: '<div style="font-family:Arial,sans-serif;padding:24px"><h2>Test email successful</h2><p>Order email notifications are ready.</p></div>' });
      if (!accepted || !Array.isArray(accepted.accepted) || !accepted.accepted.some(x => String(x).toLowerCase() === recipient.toLowerCase())) throw new Error('Recipient not accepted');
      res.json({ ok: true, message: `Test email accepted for ${recipient}.` });
    } catch (error) { res.status(400).json({ error: cleanError(error) }); }
  });
  app.post('/api/admin/orders/:id/email', need, admin, retryLimit, (req, res) => {
    const orderId = String(req.params.id || '').slice(0, 80);
    if (!db.prepare('SELECT 1 FROM orders WHERE id=?').get(orderId)) return res.status(404).json({ error: 'Order not found.' });
    if (getSetting('order_email_enabled') !== '1') return res.status(400).json({ error: 'Enable order email notifications before retrying.' });
    const current = db.prepare('SELECT status FROM order_email_notifications WHERE order_id=?').get(orderId);
    if (!current) db.prepare("INSERT INTO order_email_notifications(order_id,status) VALUES(?,'Pending')").run(orderId);
    else {
      if (current.status === 'Sending') return res.status(409).json({ error: 'An email for this order is already being sent.' });
      db.prepare("UPDATE order_email_notifications SET status='Pending',auto_attempts=0,next_attempt_at=NULL,last_error=NULL WHERE order_id=?").run(orderId);
    }
    schedule(orderId);
    res.json({ ok: true, message: 'Order email queued.' });
  });

  return { enqueue, schedule, deliver, buildMessage, status, isPrivateSetting: key => PRIVATE_KEYS.includes(key) };
};
