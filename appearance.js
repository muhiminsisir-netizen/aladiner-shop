'use strict';
/* appearance.js : Phase 4 server. Banner management (reorder/edit/styling), default-banner rules, hover-glow + slider settings. */
const path = require('path'), fs = require('fs'), crypto = require('crypto'), multer = require('multer');
module.exports = (app, db, X) => {
  const { need, admin } = X, UP = path.join(__dirname, 'uploads');
  fs.mkdirSync(UP, { recursive: true });
  const addCol = (c, d) => { if (!db.prepare('PRAGMA table_info(banners)').all().some(x => x.name === c)) db.exec(`ALTER TABLE banners ADD COLUMN ${c} ${d}`); };
  [['description', "TEXT DEFAULT ''"], ['btn_text', "TEXT DEFAULT ''"], ['text_color', "TEXT DEFAULT '#ffffff'"], ['font_size', "TEXT DEFAULT 'm'"],
   ['font_weight', 'INTEGER DEFAULT 700'], ['align', "TEXT DEFAULT 'left'"], ['pos', "TEXT DEFAULT 'bottom'"], ['sort', 'INTEGER DEFAULT 0']].forEach(([c, d]) => addCol(c, d));

  const AP = { default_show: true, default_when: 'fallback', default_title: '', default_subtitle: '', default_btn: 'Shop now', default_link: '#/shop', default_image: '',
    default_banner_color: '#123569', default_texture: 'grid', default_texture_color: '#9bdcff', default_light_color: '#65d9ff', default_text_color: '#ffffff', default_box_text_color: '#17346e',
    interval: 3, svc_open: false, glow: true, glow_intensity: 6, glow_blur: 28, glow_opacity: 0.45, glow_dur: 300, glow_color: '#4f46e5' };
  const getAP = () => { let s = {}; try { s = JSON.parse((db.prepare("SELECT value FROM settings WHERE key='appearance'").get() || {}).value || '{}'); } catch { } return { ...AP, ...s }; };
  const putAP = o => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run('appearance', JSON.stringify(o));

  const hex = v => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const bool = v => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
  const txt = (v, n) => String(v ?? '').trim().slice(0, n);
  const link = l => /^(#\/|\/|https?:\/\/)/i.test(String(l || '').trim()) ? String(l).trim().slice(0, 300) : '';
  const cleanAP = (b, cur) => {
    const o = { ...cur };
    if ('default_show' in b) o.default_show = bool(b.default_show);
    if ('default_when' in b) o.default_when = b.default_when === 'always' ? 'always' : 'fallback';
    if ('default_title' in b) o.default_title = txt(b.default_title, 100);
    if ('default_subtitle' in b) o.default_subtitle = txt(b.default_subtitle, 200);
    if ('default_btn' in b) o.default_btn = txt(b.default_btn, 30);
    if ('default_link' in b) o.default_link = link(b.default_link);
    if ('default_banner_color' in b && hex(b.default_banner_color)) o.default_banner_color = String(b.default_banner_color).trim();
    if ('default_texture' in b) o.default_texture = ['none', 'grid', 'diagonal', 'orbit'].includes(b.default_texture) ? b.default_texture : 'grid';
    if ('default_texture_color' in b && hex(b.default_texture_color)) o.default_texture_color = String(b.default_texture_color).trim();
    if ('default_light_color' in b && hex(b.default_light_color)) o.default_light_color = String(b.default_light_color).trim();
    if ('default_text_color' in b && hex(b.default_text_color)) o.default_text_color = String(b.default_text_color).trim();
    if ('default_box_text_color' in b && hex(b.default_box_text_color)) o.default_box_text_color = String(b.default_box_text_color).trim();
    if ('interval' in b) o.interval = num(b.interval, 2, 10, 3);
    if ('svc_open' in b) o.svc_open = bool(b.svc_open);
    if ('glow' in b) o.glow = bool(b.glow);
    if ('glow_intensity' in b) o.glow_intensity = num(b.glow_intensity, 0, 16, 6);
    if ('glow_blur' in b) o.glow_blur = num(b.glow_blur, 0, 60, 28);
    if ('glow_opacity' in b) o.glow_opacity = num(b.glow_opacity, 0, 1, 0.45);
    if ('glow_dur' in b) o.glow_dur = num(b.glow_dur, 0, 1000, 300);
    if ('glow_color' in b && hex(b.glow_color)) o.glow_color = String(b.glow_color).trim();
    return o;
  };
  const cleanB = b => ({
    title: txt(b.title, 100), subtitle: txt(b.subtitle, 200), description: txt(b.description, 400), btn_text: txt(b.btn_text, 30), link: link(b.link),
    text_color: hex(b.text_color) ? String(b.text_color).trim() : '#ffffff', font_size: ['s', 'm', 'l'].includes(b.font_size) ? b.font_size : 'm',
    font_weight: [400, 600, 700, 800].includes(+b.font_weight) ? +b.font_weight : 700,
    align: ['left', 'center', 'right'].includes(b.align) ? b.align : 'left', pos: ['top', 'center', 'bottom'].includes(b.pos) ? b.pos : 'bottom'
  });

  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const up = multer({
    storage: multer.diskStorage({ destination: UP, filename: (req, f, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[f.mimetype]) }),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 }, fileFilter: (req, f, cb) => cb(null, !!EXT[f.mimetype])
  });
  const sig = f => { try { const b = Buffer.alloc(12), fd = fs.openSync(f.path, 'r'); fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
    return (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'); } catch { return false; } };
  const rmUrl = u => { if (/^\/uploads\/[a-f0-9]+\.(jpg|png|webp)$/.test(u || '')) fs.unlink(path.join(UP, path.basename(u)), () => { }); };
  const chk = (req, res, next) => !req.file || sig(req.file) ? next() : (fs.unlink(req.file.path, () => { }), res.status(400).json({ error: 'Only real JPG/PNG/WebP images are allowed' }));
  const COLS = 'id,title,subtitle,description,btn_text,link,image,text_color,font_size,font_weight,align,pos';

  // ---- public ----
  app.get('/api/appearance', (req, res) => res.json(getAP()));
  app.get('/api/banners', (req, res) => res.json(db.prepare(`SELECT ${COLS} FROM banners WHERE active=1 ORDER BY sort,id DESC`).all()));

  // ---- admin: banners ----
  app.get('/api/admin/banners', need, admin, (req, res) => res.json(db.prepare('SELECT * FROM banners ORDER BY sort,id DESC').all()));
  app.post('/api/admin/banners', need, admin, up.single('image'), chk, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Banner image is required (JPG/PNG/WebP, max 3MB)' });
    const first = db.prepare('SELECT COALESCE(MIN(sort),0)-1 s FROM banners').get().s;
    db.prepare('INSERT INTO banners(title,subtitle,description,btn_text,link,text_color,font_size,font_weight,align,pos,image,sort) VALUES(@title,@subtitle,@description,@btn_text,@link,@text_color,@font_size,@font_weight,@align,@pos,@image,@sort)')
      .run({ ...cleanB(req.body || {}), image: '/uploads/' + req.file.filename, sort: first });
    res.json({ ok: 1 });
  });
  app.put('/api/admin/banners/:id', need, admin, up.single('image'), chk, (req, res) => {
    const id = +req.params.id, o = db.prepare('SELECT * FROM banners WHERE id=?').get(id);
    if (!o) { if (req.file) rmUrl('/uploads/' + req.file.filename); return res.status(404).json({ error: 'Banner not found' }); }
    const image = req.file ? '/uploads/' + req.file.filename : o.image;
    db.prepare('UPDATE banners SET title=@title,subtitle=@subtitle,description=@description,btn_text=@btn_text,link=@link,text_color=@text_color,font_size=@font_size,font_weight=@font_weight,align=@align,pos=@pos,image=@image WHERE id=@id')
      .run({ ...cleanB(req.body || {}), image, id });
    if (req.file) rmUrl(o.image);
    res.json({ ok: 1 });
  });
  app.post('/api/admin/banners/:id/toggle', need, admin, (req, res) => { db.prepare('UPDATE banners SET active=1-active WHERE id=?').run(+req.params.id); res.json({ ok: 1 }); });
  app.post('/api/admin/banners/:id/move', need, admin, (req, res) => {
    const ids = db.prepare('SELECT id FROM banners ORDER BY sort,id DESC').all().map(r => r.id), i = ids.indexOf(+req.params.id), j = i + ((req.body || {}).dir === 'up' ? -1 : 1);
    if (i < 0) return res.status(404).json({ error: 'Banner not found' });
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; db.transaction(() => ids.forEach((id, k) => db.prepare('UPDATE banners SET sort=? WHERE id=?').run(k, id)))(); }
    res.json({ ok: 1 });
  });
  app.delete('/api/admin/banners/:id', need, admin, (req, res) => {
    const o = db.prepare('SELECT image FROM banners WHERE id=?').get(+req.params.id);
    db.prepare('DELETE FROM banners WHERE id=?').run(+req.params.id); if (o) rmUrl(o.image); res.json({ ok: 1 });
  });

  // ---- admin: appearance (default banner, slider, service section, hover glow) ----
  app.get('/api/admin/appearance', need, admin, (req, res) => res.json(getAP()));
  app.post('/api/admin/appearance', need, admin, (req, res) => { putAP(cleanAP(req.body || {}, getAP())); res.json({ ok: 1 }); });
  app.post('/api/admin/appearance/image', need, admin, up.single('image'), chk, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Image is required (JPG/PNG/WebP, max 3MB)' });
    const a = getAP(); rmUrl(a.default_image); a.default_image = '/uploads/' + req.file.filename; putAP(a); res.json({ ok: 1 });
  });
  app.delete('/api/admin/appearance/image', need, admin, (req, res) => { const a = getAP(); rmUrl(a.default_image); a.default_image = ''; putAP(a); res.json({ ok: 1 }); });
};
