const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const BIBLES_DIR = path.resolve(__dirname, '..', 'scripture', 'en', 'trans');
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
          const tableInfo = db.exec("PRAGMA table_info(verses)");
          const hasUsfm = tableInfo.length > 0 && tableInfo[0].values.some(v => v[1] === 'text_usfm');
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

  manifest.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} translations to ${OUTPUT}`);
}

build().catch(e => { console.error(e); process.exit(1); });
