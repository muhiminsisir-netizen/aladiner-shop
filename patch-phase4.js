// usage: node patch-phase4.js [publicFolder]   (project root theke, Phase 1-3 er por)
const fs = require('fs'), path = require('path'), PUB = process.argv[2] || 'public';
const rep = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`Marker ${n ? 'not unique' : 'not found'}: ${a.slice(0, 80)}`); return s.replace(a, () => b); };
const F = { s: 'server.js', i: path.join(PUB, 'index.html'), a: path.join(PUB, 'admin.html') };
for (const f of [...Object.values(F), 'appearance.js', path.join(PUB, 'appearance.css'), path.join(PUB, 'store-appearance.js'), path.join(PUB, 'admin-appearance.js')]) if (!fs.existsSync(f)) throw new Error('Missing: ' + f);
let s = fs.readFileSync(F.s, 'utf8'), i = fs.readFileSync(F.i, 'utf8'), a = fs.readFileSync(F.a, 'utf8');
if (s.includes("require('./appearance')")) { console.log('Already patched'); process.exit(); }
const M = "app.get('/api/settings', (req, res) => res.json(S()));";
s = rep(s, M, "require('./appearance')(app, db, { need, admin }); // Phase 4: banners + appearance (purano /api/banners er age)\n" + M);
i = rep(i, '</head>', '<link rel="stylesheet" href="/appearance.css">\n</head>');
i = rep(i, '</body>', '<script src="/store-appearance.js"></script>\n</body>');
a = rep(a, '<script src="/admin-theme.js"></script>', '<script src="/admin-theme.js"></script>\n<script src="/admin-appearance.js"></script>');
for (const [f, c] of [[F.s, s], [F.i, i], [F.a, a]]) { fs.copyFileSync(f, f + '.p4.bak'); fs.writeFileSync(f, c); }
console.log('OK. Phase 4 patched (*.p4.bak backup ache). Server restart koro.');