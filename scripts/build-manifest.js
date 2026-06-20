const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const OLD_DIR = path.resolve(__dirname, '..', 'scripture', 'en', 'Old');
const BIBLES_DIR = path.resolve(__dirname, '..', 'scripture', 'en', 'translations');
const OUTPUT = path.resolve(__dirname, '..', 'scripture', 'en', 'translation-manifest.json');

async function build() {
  const SQL = await initSqlJs();
  const manifest = [];

  if (fs.existsSync(BIBLES_DIR)) {
    const coreFiles = fs.readdirSync(BIBLES_DIR).filter(f => f.endsWith('.sqlite') && !f.includes('_'));
    for (const file of coreFiles) {
      const slug = path.basename(file, '.sqlite');
      const buf = fs.readFileSync(path.join(BIBLES_DIR, file));
      const db = new SQL.Database(buf);
      try {
        const hasMeta = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'");
        let entry;
        if (hasMeta.length && hasMeta[0].values.length) {
          const metaRows = db.exec('SELECT key, value FROM meta');
          const meta = {};
          for (const [k, v] of metaRows[0].values) meta[k] = v;
          const hasSplit = fs.existsSync(path.join(BIBLES_DIR, `${slug}_verses.sqlite`));
          entry = {
            id: meta.slug || slug.toUpperCase(),
            name: meta.name || slug.toUpperCase(),
            shortname: (meta.slug || slug).toUpperCase(),
            lang: meta.language || 'en',
            format: hasSplit ? 'split' : 'single',
            copyright: 'Public Domain'
          };
          db.close();
        } else {
          const hasUsfm = db.exec("PRAGMA table_info(verses)").length > 0 &&
            db.exec("PRAGMA table_info(verses)")[0].values.some(v => v[1] === 'text_usfm');
          if (hasUsfm) {
            const hasNotes = fs.existsSync(path.join(BIBLES_DIR, `${slug}_notes.sqlite`));
            entry = {
              id: slug.toUpperCase(),
              name: slug.toUpperCase(),
              shortname: slug.toUpperCase(),
              lang: 'en',
              format: hasNotes ? 'usfm+notes' : 'usfm',
              copyright: 'Public Domain'
            };
          }
          db.close();
          if (!entry) continue;
        }
        manifest.push(entry);
      } catch { db.close(); }
    }
  }

  if (fs.existsSync(OLD_DIR)) {
    const files = fs.readdirSync(OLD_DIR).filter(f => f.endsWith('.db'));
    for (const file of files) {
      const id = path.basename(file, '.db');
      if (manifest.find(e => e.id === id)) continue;
      const buf = fs.readFileSync(path.join(OLD_DIR, file));
      const db = new SQL.Database(buf);
      try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const names = tables[0].values.flat();
        if (names.includes('translations')) {
          const r = db.exec('SELECT translation, title, license FROM translations');
          if (r.length && r[0].values.length) {
            const [trid, title, license] = r[0].values[0];
            const name = title.replace(/^#\s*/, '').replace(/^BSB:\s*/i, '').trim();
            manifest.push({
              id: trid,
              name: name || trid,
              shortname: trid,
              lang: 'en',
              format: 'legacy',
              copyright: (license || '').replace(/\n+/g, ' ').trim()
            });
          }
        } else if (names.includes('meta')) {
          const r = db.exec('SELECT field, value FROM meta');
          const meta = {};
          for (const [k, v] of r[0].values) meta[k] = v;
          manifest.push({
            id: meta.module || id,
            name: meta.name || id,
            shortname: meta.shortname || meta.module || id,
            lang: meta.lang_short || 'en',
            format: 'legacy',
            copyright: (meta.copyright_statement || 'Public Domain').replace(/\n+/g, ' ').trim()
          });
        }
      } finally { db.close(); }
    }
  }

  manifest.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} translations to ${OUTPUT}`);
}

build().catch(e => { console.error(e); process.exit(1); });
