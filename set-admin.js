'use strict';
// Interactive one-time admin setup/reset. Never store credentials in source code.
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const ask = (label, hidden = false) => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden && process.stdin.isTTY) process.stdin.setRawMode(true);
  let value = '';
  if (hidden && process.stdin.isTTY) {
    process.stdout.write(label);
    const onData = key => {
      if (key === '\u0003') process.exit(130);
      if (key === '\r' || key === '\n') { process.stdin.removeListener('data', onData); process.stdin.setRawMode(false); rl.close(); process.stdout.write('\n'); resolve(value); }
      else if (key === '\u007f') value = value.slice(0, -1);
      else if (key >= ' ') value += key;
    };
    process.stdin.on('data', onData);
  } else rl.question(label, answer => { rl.close(); resolve(answer); });
});

(async () => {
  const email = (await ask('Admin email: ')).trim().toLowerCase();
  const password = await ask('New password (minimum 14 characters): ', true);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 14) throw new Error('Enter a valid email and a password of at least 14 characters.');
  const db = new Database(path.join(__dirname, 'shop.db'));
  try {
    const hash = bcrypt.hashSync(password, 12), current = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY created LIMIT 1").get();
    if (current) db.prepare('UPDATE users SET email=?,hash=? WHERE id=?').run(email, hash, current.id);
    else db.prepare('INSERT INTO users(id,name,email,phone,hash,role) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(), 'Admin', email, '', hash, 'admin');
    console.log('Admin credentials updated.');
  } finally { db.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
