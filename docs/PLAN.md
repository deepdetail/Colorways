# Colorways: Feasibility and Build Plan

_Status: draft v0.1 (2026-10-31). Claims about third-party APIs, licensing, pricing, and commissions are from memory and **unverified**. Each one is marked [VERIFY]._

## 1. Thesis

Expedia, Booking, and Airbnb filter on price, stars, location, and amenities. None of them let you search by **how a place looks and feels**. Colorways adds that layer on top of existing inventory.

- **Commodity (rent it):** room inventory, availability, pricing, booking.
- **Moat (own it):** a structured dataset of each property's color palette, mood, spaces, and vibe, plus users' saved palettes and preference data.

## 2. Feasibility verdict

Buildable. The booking side is solved by partners. The hard, valuable work is the tagging pipeline and the data quality behind it. The main risks are legal (photo usage rights) and product (does vibe search drive *bookings* or just browsing?), not technical.

## 3. Architecture

### 3.1 Inventory

- Launch as **affiliate / metasearch**: users click through to the partner to book. No merchant-of-record duties (payments, refunds, seller-of-travel licensing) at launch.
- Candidate sources [VERIFY access rules, approval requirements, commission rates]:
  - Expedia partner program (Rapid API is partner-gated)
  - Booking.com Affiliate Partner Program
  - Hotelbeds
  - Amadeus Self-Service (hotel search)
- Prototype option: the Expedia hotel search connector available in Claude sessions can pull real listings for a demo.

### 3.2 Color and vibe engine (core IP)

| Layer | Method | Why |
|---|---|---|
| Palette extraction | k-means (or median cut) on each photo's pixels in CIELAB space, keep 5 to 7 dominant colors with their area share | Cheap, deterministic, no AI needed |
| Color matching | CIEDE2000 (Delta E 2000) distance between the user's swatches and the property palette, weighted by area | Matches how humans perceive color difference, unlike RGB distance |
| Mood / spaces / amenities | Vision model tags each photo against a **fixed vocabulary** (e.g. moody, airy, maximalist, soaking tub, greenery balcony, work nook) | A fixed vocabulary keeps search consistent; free-form tags drift |
| Free-text vibe | Text embeddings of generated descriptions plus user query, stored with vector search | Handles queries the vocabulary misses |
| Ranking | Weighted blend: color score + tag overlap + embedding similarity, then hard filters (dates, price, location) | Explainable and tunable |

**Cost logic:** tag once, cache forever, re-tag only new photos. Example scale: 10,000 properties at roughly 20 photos each is about 200,000 images, one-time. Search itself then costs almost nothing per query. [VERIFY current vision model pricing before quoting a dollar figure.]

**Image-level signals worth adding later:** light warmth (color temperature), brightness, saturation, "golden hour" detection, staged vs. guest photo.

### 3.3 Data model (sketch)

```
property(id, source, source_id, name, geo, price_band, url_affiliate)
photo(id, property_id, url, source_type[official|guest], license_basis)
palette(photo_id, colors[{lab, hex, share}])
photo_tag(photo_id, tag, confidence)
property_profile(property_id, palette_agg, tags_agg, embedding, confidence)
user_palette(user_id, name, swatches[], mood_tags[], created_at)
```

### 3.4 User experience

1. Choose swatches, or upload an inspiration image (Pinterest pin, outfit, room photo) to extract a palette.
2. Pick mood, required spaces, and amenities.
3. Set dates, budget, and destination (or "surprise me" across a region).
4. Results grid: each card shows the property's palette strip and "why this matched" chips (e.g. 92% palette match, golden hour light, clawfoot tub).
5. Save and share palettes ("my Lisbon palette") to drive social distribution.

## 4. Build path

| Phase | Scope | Stack | Exit criterion |
|---|---|---|---|
| 0. Concierge test | 150 to 300 hand-checked properties in **one city**, static site, affiliate links | Next.js, small database, precomputed tags | Users search by vibe and click through at a meaningful rate |
| 1. Web MVP | Live affiliate inventory, automated tagging pipeline, accounts, saved palettes | Next.js, Postgres + pgvector, background job queue, vision model API | First affiliate revenue, week-4 retention signal |
| 2. App | Mobile app or installable web app (PWA), camera "match this vibe" | React Native / Expo sharing logic with web | Repeat usage justifies app-store overhead |
| 3. Expansion | Vacation rentals, restaurants, events, brand partnerships | | New revenue lines |

**Web first:** no app-store review or fees, and search engines plus social links land directly on web pages. Native only pays off once people come back repeatedly.

## 5. Monetization

- Affiliate commission on bookings [VERIFY rates per partner].
- Premium tier: unlimited saved palettes, trip boards, alerts when a matching stay drops in price.
- Brand / destination partnerships (paint and design brands, tourism boards), clearly labeled as sponsored.
- Later: data licensing of aggregate taste trends (only with clear consent and privacy terms).

## 6. Risks and critique

1. **Photos lie.** Staged, color-graded, golden-hour shots. The palette reflects the marketing, not the room. Mitigation: weight guest photos where rights allow, show a confidence score, let users flag mismatches.
2. **Photo licensing is the biggest legal risk.** Affiliate terms usually allow displaying photos in a booking context; running AI analysis on them and storing derived data may not be covered. [VERIFY each partner's terms before building the pipeline.]
3. **Platform dependency and thin margins.** A partner can change terms or ship its own vibe filter. The defensible part is the dataset and user palettes, not the booking pipe.
4. **Novelty vs. utility.** Color search is a great demo; the open question is whether it changes booking decisions. Phase 0 exists to answer this cheaply.
5. **Name / trademark.** "Colorways" is a common term in sneakers and fashion. [VERIFY trademark availability in the travel class before branding spend.]
6. **Cold start per city.** Quality depends on dense, well-tagged coverage. Launch deep in one city rather than thin everywhere.

## 7. Open decisions

- [ ] Research mode (High vs Max) for verifying partner access, commissions, photo-license terms, vision pricing, competitors, trademark.
- [ ] First user segment: design-minded couples, solo creatives, honeymooners, or luxury travelers.
- [ ] Phase 0 launch city.
- [ ] Build a clickable prototype now (Expedia connector listings plus color-matching demo)?
- [ ] Default branch for this repo (currently the first pushed branch).
