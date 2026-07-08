import sqlite3, os

BOOK_NAME_TO_ID = {
    'Genesis': 1, 'Exodus': 2, 'Leviticus': 3, 'Numbers': 4, 'Deuteronomy': 5,
    'Joshua': 6, 'Judges': 7, 'Ruth': 8, '1 Samuel': 9, '2 Samuel': 10,
    '1 Kings': 11, '2 Kings': 12, '1 Chronicles': 13, '2 Chronicles': 14,
    'Ezra': 15, 'Nehemiah': 16, 'Esther': 17, 'Job': 18, 'Psalms': 19,
    'Proverbs': 20, 'Ecclesiastes': 21, 'Song of Solomon': 22,
    'Isaiah': 23, 'Jeremiah': 24, 'Lamentations': 25, 'Ezekiel': 26,
    'Daniel': 27, 'Hosea': 28, 'Joel': 29, 'Amos': 30, 'Obadiah': 31,
    'Jonah': 32, 'Micah': 33, 'Nahum': 34, 'Habakkuk': 35, 'Zephaniah': 36,
    'Haggai': 37, 'Zechariah': 38, 'Malachi': 39,
    'Matthew': 40, 'Mark': 41, 'Luke': 42, 'John': 43, 'Acts': 44,
    'Romans': 45, '1 Corinthians': 46, '2 Corinthians': 47,
    'Galatians': 48, 'Ephesians': 49, 'Philippians': 50, 'Colossians': 51,
    '1 Thessalonians': 52, '2 Thessalonians': 53, '1 Timothy': 54,
    '2 Timothy': 55, 'Titus': 56, 'Philemon': 57, 'Hebrews': 58,
    'James': 59, '1 Peter': 60, '2 Peter': 61, '1 John': 62,
    '2 John': 63, '3 John': 64, 'Jude': 65, 'Revelation of John': 66,
    'Revelation': 66,
}

REF_DIR = os.path.join(os.path.dirname(__file__), '..', 'scripture', 'en', 'ref')
OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'scripture', 'en', 'cross_references.db')

# Safety guard: abort if shard inputs are missing. Without shards this script
# would recreate an empty cross_references.db and wipe the existing consolidated DB.
missing_shards = [i for i in range(7)
                  if not os.path.exists(os.path.join(REF_DIR, f'cross_references_{i}.db'))]
if missing_shards:
    print('ABORT: shard inputs are missing — running this script would wipe cross_references.db.')
    print(f'Missing shards: {missing_shards}')
    print('Restore cross_references_0.db..6.db into scripture/en/ref/ before re-running.')
    raise SystemExit(1)

conn = sqlite3.connect(OUTPUT)
c = conn.cursor()

c.execute('''
    CREATE TABLE cross_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_book_id INTEGER,
        from_chapter INTEGER,
        from_verse INTEGER,
        to_book_id INTEGER,
        to_chapter INTEGER,
        to_verse_start INTEGER,
        to_verse_end INTEGER,
        votes INTEGER,
        UNIQUE(from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end)
    )
''')

c.execute('CREATE INDEX idx_from ON cross_references(from_book_id, from_chapter, from_verse)')

total_inserted = 0
total_skipped = 0

for i in range(7):
    shard_path = os.path.join(REF_DIR, f'cross_references_{i}.db')
    if not os.path.exists(shard_path):
        continue

    shard = sqlite3.connect(shard_path)
    sc = shard.cursor()
    sc.execute('SELECT from_book, from_chapter, from_verse, to_book, to_chapter, to_verse_start, to_verse_end, votes FROM cross_references')

    rows = []
    for row in sc.fetchall():
        from_book_id = BOOK_NAME_TO_ID.get(row[0])
        to_book_id = BOOK_NAME_TO_ID.get(row[3])
        if from_book_id is None or to_book_id is None:
            total_skipped += 1
            continue
        rows.append((from_book_id, row[1], row[2], to_book_id, row[4], row[5], row[6], row[7]))

    shard.close()

    c.executemany('''
        INSERT OR IGNORE INTO cross_references
            (from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse_start, to_verse_end, votes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', rows)

    total_inserted += len(rows)

conn.commit()

c.execute('SELECT COUNT(*) FROM cross_references')
final_count = c.fetchone()[0]
c.execute('PRAGMA page_count')
pages = c.fetchone()[0]
c.execute('PRAGMA page_size')
page_size = c.fetchone()[0]

conn.close()

size_mb = os.path.getsize(OUTPUT) / 1024 / 1024
print(f'Read {total_inserted} rows from {7} shards ({total_skipped} skipped)')
print(f'Unique rows after dedup: {final_count}')
print(f'Reduction: {(1 - final_count / total_inserted) * 100:.0f}%')
print(f'Output: {size_mb:.1f} MB ({pages} pages x {page_size}b)')
