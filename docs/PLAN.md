# Colorways: Feasibility and Build Plan

_Status: v0.3 (2026-10-31). v0.1 was the first feasibility pass; v0.2 added the hotel stripe, the seed dataset, the prototype and a first Max research pass; v0.3 adds shades, materials, photo spots, motifs, a public-and-liminal capture plan and the Guess the hotel game (see CONCEPT.md section 8). Items still unverified are marked [VERIFY]. Full research notes: [RESEARCH_2026-10.md](RESEARCH_2026-10.md)._

## 1. Thesis

Expedia, Booking and Airbnb filter on price, stars, location and amenities, and are now adding free-text AI search. None of them lets you search by **how a place looks and feels, space by space**. Colorways adds that layer on top of existing inventory.

- **Commodity (rent it):** inventory, availability, pricing, booking.
- **Moat (own it):** a measured dataset of each hotel's spaces (palette, coverage, style, era, genre, mood), plus the content and community around it: the hotel stripe, the walkthrough barcode, the key swatch.
- **Content-led:** famous magazine and film moments at hotels (linked and credited), hotel and destination promo material (with permission), and your own calibrated shoots (owned and measured). See [CONCEPT.md](CONCEPT.md).

## 2. Feasibility verdict

Still buildable, and now partly built. The color engine works today with plain math in the browser (no AI calls, no uploads). The hard parts are unchanged and clearer:

1. **Data rights:** no partner program found grants rights to run computer vision on its photos, so measured palettes must come from your own shoots and from hotels that say yes.
2. **Data volume:** the stripe is only as good as space-level coverage. The seed has 74 sourced colors across 10 hotels, all Described (approximations of cited text). The first real milestone is Measured data.
3. **Differentiation:** Google, Airbnb and Booking all launched or tested natural-language hotel search in 2024-2026. Colorways wins on space-level color data and content, not on "AI search".

## 3. Architecture

### 3.1 Inventory (verified this pass)

- Start with click-out links: **Expedia affiliate** (up to 4%), **Booking.com via Awin or CJ** (up to 4%; Booking ended many direct affiliates on June 20, 2025), and **Stay22** maps for the fastest embed.
- Later: Expedia Rapid and the Booking.com Demand API both need partner approval or managed-partner status.
- Not viable: **Amadeus Self-Service** (portal decommissioned, keys disabled July 17, 2026) and **Hotelbeds** (net-rate wholesaler).
- Sources for each are in the research log.

### 3.2 Color engine (implemented in the prototype)

| Layer | Method | Where |
|---|---|---|
| Color science | sRGB to CIELAB (D65); CIEDE2000 distance (matches the Sharma et al. 2005 reference pairs) | app/js/color.js, tools/colorlib.py, workbook formulas |
| Palette extraction | k-means++ in CIELAB, seeded and repeatable; near-duplicates merged under Delta E 5 | app/js/kmeans.js |
| Photo-op regions | Drag a box on a photo; its dominant colors become key swatches | Analyze tab |
| Families | 15 families from L*, C*, h; identical rules in JavaScript, Python and Excel (checked on 3,000 random colors and every seed swatch) | color.js, colorlib.py, Swatches tab |
| Coverage | Share of a space the logged colors describe; the rest renders as not yet documented | model.js, Spaces tab |
| Stripe | Spaces in stay order, width by Area, Time or Equal, colors by share x coverage | model.js, Index tab, Stripes sheets |
| Key swatch | Five distinct chips favoring photo-op, vivid and high photo-op-score colors | model.js |
| Search | Per target color: best CIEDE2000 closeness x prominence; average across targets; shows receipts | model.js, Search tab |
| Walkthrough barcode | Frames sampled across a video; average light or dominant color per frame | Barcode tab |

AI vision tagging (mood, style, materials) is a later layer for scale, not needed for the prototype. [VERIFY current vision-model pricing when that layer is scoped.]

### 3.3 Data model

The workbook ([data dictionary](DATA_DICTIONARY.md)) is the working database for now: Hotels, Spaces, Swatches, Stripes_Area, Stripes_Time, Media_Sources, Capture_Log, Sources, Lists. data/seed/hotels.json plus data/vocab.json generate both the workbook and the web app's data (python3 tools/build.py), so they cannot drift.

### 3.4 User experience (prototype)

1. **Index:** every hotel as a stripe plus key swatch, with style, era and genre tags, filters, and the Area / Time / Equal toggle. Each hotel opens to a table view with every space, color, share, coverage and source.
2. **Search by color:** up to five colors, whole families, or an inspiration image; filter by space type; ranked results with "why this matched".
3. **Analyze photos:** measure a space from your photos, mark photo-op regions, save as Measured, export CSVs that paste into the workbook.
4. **Walkthrough barcode:** turn a curb-to-room video into a film-style color barcode.
5. **Method:** how the stripe, families and defaults work.

## 4. Build path (revised)

| Phase | Scope | Exit criterion |
|---|---|---|
| 0a. Signature Index (now) | Your Wave 1 list in the workbook; desk research finished; Described colors as placeholders | Every Wave 1 hotel has status, designers and a sourced palette description |
| 0b. Measured pilot | Shoot 5 to 8 hotels you can reach soon with the capture protocol, public and liminal spaces first; log photo spots (murals, carpets, stairs, elevator lobbies); replace Described with Measured; publish spots, stripes and walkthrough barcodes on social | People recognize hotels from their stripes (the "guess the hotel" test) and click through |
| 1. Web MVP | Real site with affiliate links (Expedia, Booking via Awin/CJ, or Stay22), accounts, saved palettes, the daily guess-the-hotel game | First affiliate revenue; repeat visits |
| 2. Verified Palette program | Hotels commission a calibrated shoot and get a stripe, key swatch and barcode for their marketing | First paid hotel partner |
| 3. App | Installable web app or React Native; camera "match this vibe" | Repeat use justifies app-store overhead |

## 5. Monetization

- Affiliate commission on bookings (Expedia up to 4%; Booking.com up to 4% via networks; Agoda and Priceline about 3-7% per third-party sources).
- **Verified Palette program** for hotels (B2B; not dependent on affiliate margins).
- Premium tier: saved palettes, trip boards, price alerts on matching stays.
- Sponsored placements with paint, textile and design brands, clearly labeled.

## 6. Risks and critique

1. **Photos lie** (staging, grading, golden hour). Mitigation: the capture protocol (gray card, fixed shot list), coverage, confidence labels.
2. **Photo rights:** no partner grants computer-vision rights that we found; get written permission or use owned shoots.
3. **Platform moves:** the big platforms now have natural-language search; they could add aesthetic filters. The defensible part is measured data plus content.
4. **Area weighting distorts** (ballrooms, casinos, pool decks). Test Time or Equal as the consumer default.
5. **Name:** "Colorways" is common in sneakers and fashion. [VERIFY trademark in classes 9, 35, 39, 42, 43.]
6. **Seed data is thin and approximate:** 10 of 44 hotels have colors, all Described. Treat the current Index as a demo of the format, not a ranking.

## 7. Open decisions

- [x] Research mode: Max (first pass done; second pass planned in the research log).
- [x] Launch set: your Wave 1 list (in the workbook), plus Wave 2 candidates and a backlog.
- [x] Prototype: built (app/).
- [x] Repo default branch: main (recommended), with work on feature branches.
- [ ] Which "Biltmore": Asheville, Arizona, Coral Gables or Los Angeles?
- [ ] What "one more FA" meant in your Four Seasons line.
- [ ] Default stripe weighting for consumers: Area (your concept), Time, or Equal.
- [ ] First 5 to 8 hotels to shoot for the Measured pilot, and when.
- [ ] Second research pass: approve the plan in the research log, now focused on public and liminal spots (murals, carpets, elevator lobbies, restrooms) and the Lafayette's marbles and greens.
- [ ] Tune color-character thresholds against 20 measured spots you consider iconic.
