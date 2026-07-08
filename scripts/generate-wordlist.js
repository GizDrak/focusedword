const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '..', 'scripture', 'en', 'trans', 'bsb_v3.sqlite');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'assets', 'lists', 'bible-wordlist.json');
const TARGET_WORDS = 2048;
const MIN_WORD_LENGTH = 5;

function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  const results = db.exec('SELECT clean_text FROM bible_verses');
  db.close();

  if (!results.length || !results[0].values.length) {
    console.error('No verses found in database');
    process.exit(1);
  }

  const allText = results[0].values.flat().join(' ');

  const cleaned = allText.toLowerCase().replace(/[^a-z\s]/g, '');

  const words = cleaned.split(/\s+/).filter(w => w.length >= MIN_WORD_LENGTH);

  const unique = [...new Set(words)];

  const shuffled = fisherYatesShuffle(unique);

  const selected = shuffled.slice(0, TARGET_WORDS);

  selected.sort();

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected, null, 2));

  console.log(`Created ${OUTPUT_PATH} with ${selected.length} words`);
  console.log('First 5:', selected.slice(0, 5));
  console.log('Last 5:', selected.slice(-5));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
