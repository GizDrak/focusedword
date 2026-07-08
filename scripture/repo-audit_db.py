#!/usr/bin/env python3
"""
Database Auditor for bible SQLite databases.

Usage:
    python audit_db.py path/to/bible.sqlite
    python audit_db.py path/to/bible.sqlite --verbose
    python audit_db.py path/to/bible.sqlite --json --require-fts --strict-metadata
"""

import sqlite3
import json
import re
import sys
import argparse
import dataclasses
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


KNOWN_TOKEN_TYPES = {
    "text", "paragraph_start", "poetry_start", "line_break",
    "style_start", "style_end", "section_heading", "cross_ref",
    "footnote", "acrostic_heading", "list_item",
}
KNOWN_STYLES = {"wj", "nd", "qs"}


@dataclass
class AuditIssue:
    severity: str
    category: str
    verse_id: str = ""
    detail: str = ""


@dataclass
class AuditResult:
    ok: bool = True
    db_path: str = ""
    file_size: int = 0
    translation_name: str = ""
    translation_abbreviation: str = ""
    tables: list[str] = field(default_factory=list)
    has_fts: bool = False
    total_verses: int = 0
    books_count: int = 0
    footnote_count: int = 0
    wj_count: int = 0
    errors: int = 0
    warnings: int = 0
    issues: list[AuditIssue] = field(default_factory=list)


def _error(result: AuditResult, category: str, verse_id: str = "", detail: str = ""):
    result.issues.append(AuditIssue("error", category, verse_id, detail))
    result.errors += 1
    result.ok = False


def _warning(result: AuditResult, category: str, verse_id: str = "", detail: str = ""):
    result.issues.append(AuditIssue("warning", category, verse_id, detail))
    result.warnings += 1


def _get_tables(cursor) -> set[str]:
    return {r[0] for r in cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}


def _get_columns(cursor, table: str) -> set[str]:
    return {r[1] for r in cursor.execute(
        f"PRAGMA table_info({table})"
    ).fetchall()}


def _extract_metadata(result: AuditResult, cursor, tables: set[str], strict: bool):
    for tbl in ("metadata", "bible_metadata", "translation_meta", "meta"):
        if tbl not in tables:
            continue
        try:
            cols = _get_columns(cursor, tbl)
            if "key" in cols and "value" in cols:
                all_rows = cursor.execute(
                    f"SELECT key, value FROM {tbl}"
                ).fetchall()
                kv = {k: v for k, v in all_rows if v and str(v).strip()}

                for name_key in ("translation_name", "name", "title", "translation"):
                    if name_key in kv:
                        result.translation_name = str(kv[name_key]).strip()
                        break

                for abbr_key in ("abbreviation", "short_name", "code"):
                    if abbr_key in kv:
                        result.translation_abbreviation = str(kv[abbr_key]).strip()
                        break

                if result.translation_name:
                    return
            if "name" in cols:
                row = cursor.execute(
                    f"SELECT name FROM {tbl} LIMIT 1"
                ).fetchone()
                if row and row[0] and str(row[0]).strip():
                    result.translation_name = str(row[0]).strip()
                    return
            if "translation_name" in cols:
                row = cursor.execute(
                    f"SELECT translation_name FROM {tbl} LIMIT 1"
                ).fetchone()
                if row and row[0] and str(row[0]).strip():
                    result.translation_name = str(row[0]).strip()
                    return
        except sqlite3.Error:
            continue

    if "translations" in tables:
        try:
            cols = _get_columns(cursor, "translations")
            col = "name" if "name" in cols else next(iter(cols), None)
            if col:
                row = cursor.execute(
                    f"SELECT {col} FROM translations LIMIT 1"
                ).fetchone()
                if row and row[0] and str(row[0]).strip():
                    result.translation_name = str(row[0]).strip()
                    return
        except sqlite3.Error:
            pass

    if strict and not result.translation_name:
        _error(result, "translation_name_not_found",
               detail="No translation name could be found in database metadata")


def audit_database(
    db_path: str,
    *,
    strict_metadata: bool = False,
    require_fts: bool = False,
    warnings_as_errors: bool = False,
) -> AuditResult:
    result = AuditResult(db_path=db_path)
    p = Path(db_path)

    if not p.exists():
        _error(result, "file_not_found", detail=str(p))
        return result
    result.file_size = p.stat().st_size

    try:
        conn = sqlite3.connect(str(p))
        cursor = conn.cursor()
    except sqlite3.Error as e:
        _error(result, "db_open_error", detail=str(e))
        return result

    try:
        for row in cursor.execute("PRAGMA integrity_check").fetchall():
            if row[0] != "ok":
                _error(result, "integrity_check_failed", detail=str(row[0]))
    except sqlite3.Error as e:
        _error(result, "integrity_check_error", detail=str(e))

    tables = _get_tables(cursor)
    result.tables = sorted(tables)
    result.has_fts = "bible_search" in tables

    has_verses = True
    if "bible_verses" not in tables:
        _error(result, "missing_table", detail="Required table 'bible_verses' not found")
        has_verses = False

    if has_verses:
        cols = _get_columns(cursor, "bible_verses")
        required = {"id", "book", "chapter", "verse", "clean_text", "json_tokens"}
        missing = required - cols
        if missing:
            _error(result, "missing_columns",
                   detail=f"Required columns missing from bible_verses: {', '.join(sorted(missing))}")
            has_verses = False

    if has_verses:
        total = cursor.execute("SELECT COUNT(*) FROM bible_verses").fetchone()[0]
        result.total_verses = total
        if total == 0:
            _error(result, "empty_bible_verses", detail="bible_verses has no rows")
            has_verses = False

    if has_verses:
        for dup_id, count in cursor.execute(
            "SELECT id, COUNT(*) FROM bible_verses GROUP BY id HAVING COUNT(*) > 1"
        ).fetchall():
            _error(result, "duplicate_id", detail=f"id '{dup_id}' appears {count} times")

        for book, ch, vs, count in cursor.execute(
            "SELECT book, chapter, verse, COUNT(*) FROM bible_verses "
            "GROUP BY book, chapter, verse HAVING COUNT(*) > 1"
        ).fetchall():
            _error(result, "duplicate_verse",
                   detail=f"'{book} {ch}:{vs}' appears {count} times")

    _extract_metadata(result, cursor, tables, strict=strict_metadata)
    if not result.translation_abbreviation:
        result.translation_abbreviation = p.stem

    if require_fts:
        if "bible_search" not in tables:
            _error(result, "missing_search_table",
                   detail="Required table 'bible_search' not found")
        else:
            fts_count = cursor.execute(
                "SELECT COUNT(*) FROM bible_search"
            ).fetchone()[0]
            if fts_count == 0:
                _error(result, "empty_search_table", detail="bible_search has no rows")
            else:
                if has_verses and result.total_verses != fts_count:
                    _error(result, "fts_count_mismatch",
                           detail=f"bible_verses={result.total_verses} bible_search={fts_count}")

                sample = cursor.execute(
                    "SELECT verse_id FROM bible_search LIMIT 1"
                ).fetchone()
                if sample and has_verses:
                    test_row = cursor.execute(
                        "SELECT clean_text FROM bible_verses WHERE id=?",
                        (sample[0],),
                    ).fetchone()
                    if test_row and test_row[0]:
                        words = re.findall(r"[A-Za-z0-9]+", str(test_row[0]))
                        if words:
                            try:
                                match = cursor.execute(
                                    "SELECT verse_id FROM bible_search "
                                    "WHERE clean_text MATCH ? LIMIT 1",
                                    (words[0],),
                                ).fetchone()
                                if not match:
                                    _error(result, "fts_query_failed",
                                           detail=f"MATCH '{words[0]}' returned no results in bible_search")
                            except sqlite3.Error as e:
                                _error(result, "fts_query_error", detail=str(e))

    if has_verses:
        id_pat = re.compile(r"^[A-Z0-9]{3,4}\.\d+\.\d+$")
        rows = cursor.execute(
            "SELECT id, book, chapter, verse, clean_text, json_tokens "
            "FROM bible_verses ORDER BY id"
        ).fetchall()
        books = set()

        for verse_id, book, ch, vs, clean_text, tokens_str in rows:
            books.add(book)

            if not verse_id or not id_pat.match(str(verse_id)):
                _error(result, "invalid_verse_id_format",
                       verse_id=str(verse_id), detail=str(verse_id)[:50])

            if book is None or ch is None or vs is None:
                _error(result, "null_field",
                       verse_id=str(verse_id),
                       detail=f"book={book} chapter={ch} verse={vs}")

            if ch is not None:
                try:
                    if int(ch) < 1:
                        _error(result, "invalid_chapter",
                               verse_id=str(verse_id), detail=f"chapter={ch}")
                except (ValueError, TypeError):
                    _error(result, "invalid_chapter",
                           verse_id=str(verse_id), detail=f"chapter={ch}")

            if vs is not None:
                try:
                    if int(vs) < 1:
                        _error(result, "invalid_verse",
                               verse_id=str(verse_id), detail=f"verse={vs}")
                except (ValueError, TypeError):
                    _error(result, "invalid_verse",
                           verse_id=str(verse_id), detail=f"verse={vs}")

            if not clean_text:
                _error(result, "empty_clean_text", verse_id=str(verse_id))

            tokens = []
            if tokens_str:
                try:
                    tokens = json.loads(tokens_str)
                    if not isinstance(tokens, list):
                        _error(result, "tokens_not_list",
                               verse_id=str(verse_id),
                               detail=f"expected list, got {type(tokens).__name__}")
                        tokens = []
                except json.JSONDecodeError as e:
                    _error(result, "invalid_json_tokens",
                           verse_id=str(verse_id), detail=str(e)[:100])
                    tokens = []
            else:
                _error(result, "empty_json_tokens", verse_id=str(verse_id))

            if not tokens:
                continue

            text_parts = []
            style_stack = []
            for tok in tokens:
                ttype = tok.get("type")
                if ttype and ttype not in KNOWN_TOKEN_TYPES:
                    _warning(result, "unknown_token_type",
                             verse_id=str(verse_id), detail=f"type={ttype}")

                if ttype == "style_start":
                    s = tok.get("style")
                    if s:
                        style_stack.append(s)
                elif ttype == "style_end":
                    s = tok.get("style")
                    if style_stack:
                        top = style_stack[-1]
                        if top != s:
                            _warning(result, "style_mismatch",
                                     verse_id=str(verse_id),
                                     detail=f"open='{top}' close='{s}'")
                        style_stack.pop()
                    else:
                        _warning(result, "extra_style_close",
                                 verse_id=str(verse_id), detail=f"stray '{s}'")

                if ttype == "text":
                    txt = tok.get("text", "")
                    if not isinstance(txt, str) or not txt.strip():
                        _warning(result, "empty_text_token", verse_id=str(verse_id))
                    else:
                        text_parts.append(txt)
                        for ch in ("\u00b6", "|", "\\"):
                            if ch in txt:
                                _warning(result, "leakage_in_text_tokens",
                                         verse_id=str(verse_id),
                                         detail=f"contains {repr(ch)}")

                if ttype == "footnote":
                    if "text" not in tok and "marker" not in tok:
                        _warning(result, "malformed_footnote", verse_id=str(verse_id))
                if ttype == "cross_ref":
                    if "text" not in tok and not ("origin" in tok or "target" in tok):
                        _warning(result, "malformed_cross_ref", verse_id=str(verse_id))

            if style_stack:
                _warning(result, "unclosed_styles",
                         verse_id=str(verse_id),
                         detail=f"unclosed: {style_stack}")

            if clean_text and text_parts and isinstance(clean_text, str):
                recon = " ".join(" ".join(text_parts).split()).strip()
                c_norm = " ".join(re.sub(r"[^\w\s]", "", clean_text.lower()).split())
                r_norm = " ".join(re.sub(r"[^\w\s]", "", recon.lower()).split())
                if c_norm != r_norm and c_norm and r_norm:
                    _warning(result, "text_mismatch",
                             verse_id=str(verse_id),
                             detail="clean_text vs token reconstruction differ")

        result.books_count = len(books)

        try:
            result.footnote_count = cursor.execute(
                "SELECT COUNT(*) FROM bible_verses "
                "WHERE json_tokens LIKE '%\"type\": \"footnote\"%'"
            ).fetchone()[0]
        except sqlite3.Error:
            pass

        try:
            result.wj_count = cursor.execute(
                "SELECT COUNT(*) FROM bible_verses "
                "WHERE json_tokens LIKE '%\"style\": \"wj\"%'"
            ).fetchone()[0]
        except sqlite3.Error:
            pass

    conn.close()

    if warnings_as_errors and result.warnings > 0:
        result.ok = False
        result.errors += result.warnings

    return result


def print_audit_report(result: AuditResult, verbose: bool = False):
    status = "PASS" if result.ok else "FAIL"
    print(f"\n{'=' * 60}")
    print(f"AUDIT RESULT - {status}")
    print(f"{'=' * 60}")
    print(f"File: {result.db_path}")
    print(f"Size: {result.file_size:,} bytes")
    print(f"Tables: {', '.join(result.tables)}")
    if result.translation_name:
        print(f"Translation: {result.translation_name}")
    print(f"Search: {'present' if result.has_fts else 'absent'}")
    print(f"Verses: {result.total_verses:,}")
    print(f"Books: {result.books_count}")
    if result.footnote_count:
        print(f"Footnote verses: {result.footnote_count:,}")
    if result.wj_count:
        print(f"Red-letter verses: {result.wj_count:,}")
    print(f"Errors: {result.errors}")
    print(f"Warnings: {result.warnings}")

    if result.errors:
        print(f"\n--- Errors ---")
        for iss in result.issues:
            if iss.severity != "error":
                continue
            loc = f" [{iss.verse_id}]" if iss.verse_id else ""
            det = f" - {iss.detail}" if iss.detail else ""
            print(f"  [{iss.category}]{loc}{det}")

    if result.warnings:
        print(f"\n--- Warnings ---")
        if verbose:
            for iss in result.issues:
                if iss.severity != "warning":
                    continue
                loc = f" [{iss.verse_id}]" if iss.verse_id else ""
                det = f" - {iss.detail}" if iss.detail else ""
                print(f"  [{iss.category}]{loc}{det}")
        else:
            cats = Counter(
                iss.category for iss in result.issues if iss.severity == "warning"
            )
            for cat, count in sorted(cats.items()):
                print(f"  [{cat}] {count} occurrence(s)")

    print(f"\n{'─' * 60}")
    print(f"Status: {status}")


def audit_bible_database(db_path: str, verbose: bool = False) -> int:
    result = audit_database(db_path)
    print_audit_report(result, verbose=verbose)
    return 0 if result.ok else 1


def main():
    parser = argparse.ArgumentParser(
        description="Audit a bible SQLite database"
    )
    parser.add_argument(
        "db_path", nargs="?", default="bible.sqlite",
        help="Path to SQLite database (default: bible.sqlite)"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Show detailed output"
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output JSON"
    )
    parser.add_argument(
        "--require-fts", action="store_true",
        help="Fail if FTS is missing or broken"
    )
    parser.add_argument(
        "--strict-metadata", action="store_true",
        help="Fail if translation name is missing"
    )
    parser.add_argument(
        "--warnings-as-errors", action="store_true",
        help="Treat warnings as errors"
    )
    args = parser.parse_args()

    result = audit_database(
        args.db_path,
        strict_metadata=args.strict_metadata,
        require_fts=args.require_fts,
        warnings_as_errors=args.warnings_as_errors,
    )

    if args.json:
        print(json.dumps(dataclasses.asdict(result), indent=2, default=str))
    else:
        print_audit_report(result, verbose=args.verbose)

    sys.exit(0 if result.ok else 1)


if __name__ == "__main__":
    main()
