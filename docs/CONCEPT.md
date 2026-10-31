# The Hotel Stripe: concept and product logic

_Draft v0.2, 2026-10-31. Sources are linked inline. Anything from memory rather than a source is marked (from memory)._

## 1. The idea in one paragraph

Every hotel gets a color fingerprint built the way climate scientists and film nerds already compress big data into one strip. A **hotel stripe** lays the key spaces of a stay side by side (arrival, lobby, bar, room, bath, pool, spa, dinner, drinks), sizes each block by square footage (or by time spent there), and fills each block with that space's colors in proportion to how much of the space they cover. Under the stripe, a **key swatch** of five chips gives the simplified, striking read: the colors you would photograph. Travelers search by picking swatches ("emerald and brass, in the bar") and get ranked stays with a "why this matched" readout.

## 2. Prior art we are borrowing from

| Form | What one unit encodes | How color is chosen | Source |
|---|---|---|---|
| Warming stripes (Ed Hawkins, University of Reading, 2018) | One stripe per year, in time order, no axes | Blue cooler / red warmer than the 1971-2000 average; scaled to each place | [University of Reading](https://www.reading.ac.uk/en/planet/climate-resources/climate-stripes), [palette method](https://blog.scientific-python.org/matplotlib/warming-stripes/) |
| Moviebarcode (anonymous Tumblr, 2011) | One sliver per frame, in time order | Each frame squeezed to its color | [FlowingData](https://flowingdata.com/?p=15125) |
| The Colors of Motion (Charlie Clark, 2014) | Frames sampled across a film | Average color per frame | [The Next Web](https://thenextweb.com/news/colors-motion-interactive-visualization-movie-color) |
| Cinemetrics (Frederic Brodbeck, 2011) | Shots arranged as a ring | Dominant colors per scene | [CreativeApplications](https://www.creativeapplications.net/project/cinemetrics-processing/) |
| Palette trivia | Guess the film from its palette | Curated palettes | [V&A Marvel quiz](https://www.vam.ac.uk/mused/films-shows/can-you-match-the-colours-to-the-marvel-movie/), [Kottke 2011 guessing thread](https://kottke.org/11/03/movie-bar-codes) |

Two lessons carry over directly. First, these graphics work because they remove axes and numbers and let color carry the story. Second, critics of averaged film barcodes note that averaging muddies color ([MetaFilter discussion](https://metafilter.com/142548/The-Colors-of-Motion)); clustering for dominant colors keeps them vivid. Colorways uses clustering (k-means in CIELAB) for spaces and offers both modes for video.

Licensing note: Hawkins' graphics are reported as CC BY 4.0 with credit and a link ([repost of the site text](https://www.bespacific.com/?p=98906)); the official site could not be read from this environment. Colorways reuses the idea, not the graphics, but crediting the inspiration is good form.

## 3. Translating the idea to a hotel, from first principles

A stripe needs three encodings. Here is what each one means for a hotel and why.

1. **The ordering axis (what "left to right" means).** A film has time. A hotel stay also has time: you arrive, check in, go to your room, sleep, swim, eat, drink. So the stripe reads as a 24-hour stay, using a fixed journey order (Arrival, Lobby, Lobby Bar, Corridor, Room, Suite, Bath, Cafe, Pool, Grounds, Spa, Fitness, Restaurant, Bar, Rooftop, Casino, Nightclub, Events). Fixed order matters: it makes stripes comparable between hotels, the way every warming stripe runs oldest to newest.
2. **Block width (how much each space matters).** Three honest options, all built into the prototype:
   - **Area** (your "colors per square foot"): faithful to the building. Weakness: a 6-acre pool deck or a casino swamps a 450 sq ft room even though guests spend most of their stay in the room.
   - **Time** (hours a typical guest spends there): faithful to the experience. Weakness: dwell times are assumptions until measured.
   - **Equal**: the cleanest way to compare hotels side by side.
3. **Fill (the colors).** Inside each block, colors get width in proportion to their share of that space (granular read). A fourth idea came out of building this: **coverage**. When a source only describes one feature (a pink-rock chandelier in a spa), painting the whole 8,000 sq ft spa pink would lie. Coverage records how much of a space the logged colors describe; the rest is drawn as hatched "not yet documented". Measured photo sets are 100% coverage by definition (of what was photographed).

**The key swatch** is the simplified read you asked for: five chips chosen for being striking (high chroma), flagged as photo-op colors, and from spaces with high photo-op scores, with a minimum perceptual distance (CIEDE2000 of 12 or more) so no two chips look alike. It stays the same when you change the width mode, so it works as the hotel's color "logo".

## 4. Three artifacts, three jobs

| Artifact | Built from | Job | Analogy |
|---|---|---|---|
| **Hotel stripe** | Per-space palettes (photos or cited descriptions) + area or time | Compare and search hotels; the data product | Warming stripes |
| **Walkthrough barcode** | One continuous video from curb to room (and onward) | Social content and proof; the literal film barcode | Moviebarcode |
| **Key swatch** | Photo-op regions and vivid colors | Identity, thumbnails, the "guess the hotel" game | A film's palette card |

The walkthrough barcode is the purest translation of the movie barcode: your phone video, sampled frame by frame, becomes a time-ordered strip. It doubles as content (a Reel where the barcode draws itself as you walk) and as evidence that the palette is real.

## 5. Search, explained simply

You pick up to five colors (or whole families, or upload an inspiration image and let it extract four). For each color, Colorways finds the closest logged color in each hotel, scores closeness with CIEDE2000 (the standard measure of perceived color difference) and weights by how much of the space that color covers. The score is the average across your colors, and every result shows its receipts: "Lobby Bar (Trade Room), Yellow & Gold, Delta E 3.4".

## 6. Content strategy: three sources, three rights levels

Your idea combines famous magazine shoots, destination promo material, and your own shoots. Each comes with different rights, and the product should treat them differently. (Rights notes below are leads from memory, not legal advice; see the research log.)

| Source | Value | Rights posture | Use in product |
|---|---|---|---|
| Famous magazine and film shoots at hotels | Cultural cachet and discovery ("the TY Bar from the Met Gala party") | Images belong to publishers and photographers | Link out and credit; log in Media_Sources as Reference only; describe colors in words; no republishing images without a license |
| Hotel and destination promo material | Professional, on-brand imagery, hotels want exposure | Usually editorial-use terms; get written permission from PR | Request media kits; ask for analysis rights explicitly |
| Your own shoots | Owned, calibrated, measurable | Owned (with property permission for commercial use) | The "Measured" tier: the only data that should drive rankings long term |

**A sales angle worth testing (your GTM lane):** hotels' marketing teams are a second customer. A "Colorways Verified Palette" program (a calibrated shoot, a stripe, a key swatch, and a walkthrough barcode, in exchange for access, floor-area data and image rights) turns the hardest data problem into a revenue line that does not depend on affiliate margins.

**A growth loop worth testing:** a daily "Guess the hotel by its stripe" game, the hotel version of film palette quizzes and of Framed, the daily guess-the-film game ([NME on Framed](https://www.nme.com/games/framed)). Every answer reveals the hotel, its booking link, and its story.

## 7. Where this could be better (critique)

- **Area weighting flatters big rooms nobody remembers.** Ballrooms, casinos and pool decks dominate. Keep Area for analysis, but test Time or Equal as the consumer default.
- **Pixel share is not surface share.** A photo of a lobby is framed for drama; it over-represents the feature wall. Shoot a standard set of wide frames per space (see the capture protocol) before trusting shares.
- **Color drifts with light.** The same marble reads honey at 10 a.m. and amber at 9 p.m. Gray-card every set, and log time of day.
- **Described colors are a bootstrap, not a product.** They are sourced and labeled, but the hexes are approximations of words. Rank on Measured data as soon as a city has enough of it.
- **The key swatch weights are judgment calls** (chroma boost, photo-op boost). They should be tuned against what people actually pick in a quick preference test.
- **Families are a convenience, not a truth.** Fifteen buckets with fixed boundaries will misfile edge cases (a dusty pink can land in Beige). The exact Lab values are always kept underneath.
