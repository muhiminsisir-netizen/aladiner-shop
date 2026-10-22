'use strict';
// Creates a unique source/upload copy and a consistent SQLite online backup.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = __dirname;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(root, 'backups', stamp);
if (fs.existsSync(dest)) throw new Error(`Backup destination already exists: ${dest}`);
fs.mkdirSync(dest, { recursive: true });

(async () => {
  let db;
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (['backups', 'node_modules', '.git'].includes(entry.name) || /^shop\.db(?:-(?:shm|wal))?$/.test(entry.name)) continue;
      fs.cpSync(path.join(root, entry.name), path.join(dest, entry.name), { recursive: true, errorOnExist: true });
    }
    db = new Database(path.join(root, 'shop.db'), { readonly: true, fileMustExist: true });
    await db.backup(path.join(dest, 'shop.db'));
    const verify = new Database(path.join(dest, 'shop.db'), { readonly: true, fileMustExist: true });
    const integrity = verify.pragma('integrity_check', { simple: true });
    verify.close();
    if (integrity !== 'ok') throw new Error(`Backup database integrity check failed: ${integrity}`);
    console.log(`Backup complete: ${dest}`);
    console.log('Project sources and uploads copied; SQLite online backup passed integrity_check.');
  } catch (error) {
    console.error(`Backup incomplete at ${dest}: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (db) db.close();
  }
})();
