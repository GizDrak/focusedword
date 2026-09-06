# Icons — Provenance and License

All icon assets in this directory are original artwork created for Focused
Word and are covered by the project's MIT license (see repository root
[`LICENSE`](../../LICENSE)). They are not third-party works.

## App icon

- `icon.svg` — source vector artwork.
- Derived raster/PWA icons: `icon-48.png`, `icon-72.png`, `icon-96.png`,
  `icon-144.png`, `icon-dark.svg`, `icon-light.svg`, `ios/*`,
  `android/*`, `pwa/icon-192.png`, `pwa/icon-512.png`,
  `pwa/maskable-icon.png`.

## Verse topic badges

- `design/icons/verse_topic_icons/*.svg` — original AI-generated artwork for the
  ten verse topics (God, Jesus Christ, Salvation, Sin & Judgment, Faith & Trust,
  Worship & Prayer, Covenant & Law, People of God, History & Nation, Wisdom &
  Prophecy), slimmed and collapsed to single-tone `currentColor` at build time
  into `client/js/data/verse-topic-icons.js` (`scripts/slim-verse-topic-icons.mjs`).

## UI glyphs

- `ui/*.svg` — interface icons created for this project.

If any icon is replaced with a third-party icon set, add its license and
required attribution to [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)
and to `scripts/asset-inventory.json`, and regenerate checksums with
`scripts/verify-assets.mjs --update`.
