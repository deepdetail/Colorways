# Research log: October 31, 2026 (Max mode, first pass)

## How this pass ran, and its limits

- Eight research agents ran in parallel: five on hotels (by region and brand), one on candidate hotels, one on prior art and rights, one on booking infrastructure, competitors and trademark.
- **Search cap:** web searches are capped at 200 per turn across all agents. The cap was hit partway through, so several topics are partial or not started (listed below).
- **Blocked page reads:** the environment's network policy denied page fetches for these hosts, so every quote is from search-result excerpts, not the full page: showyourstripes.info, en.wikipedia.org, climate-lab-book.ac.uk, hospitalitydesign.com, dezeen.com, savingplaces.org, nationalgeographic.com, madonnainn.com, partner.expediagroup.com, phocuswire.com, netinfluencer.com, afar.com, hotelbusiness.com, fourseasons.com, nfocusmagazine.com, hospitality-interiors.net, businesswire.com, rockwellgroup.com, hospitalitynet.org, sleepermagazine.com, manchesterfinancialgroup.com.
- **Search-provider limits:** searches restricted to architecturaldigest.com, cntraveler.com, travelandleisure.com, latimes.com and sanluisobispo.com were refused, so those outlets are underrepresented.
- Rule applied throughout: nothing invented. Missing facts are marked NOT FOUND or Unverified in the workbook.

## 1. Hotel coverage

| Hotel | 2026 status | What we have | Biggest gaps |
|---|---|---|---|
| Fontainebleau Las Vegas | Open (Oct 2026 news) | Designers by space; blue/silver/coral palette; navy moire VIP check-in; lapis spa (55,000 sq ft); room carpet; 3,644 rooms | Bar and restaurant colors; Bleau Bar details |
| Virgin Hotels Las Vegas | Open (2026 releases), Curio Collection by Hilton | Pool club, music venue, casino operator change | Designers, palette, opening date as Virgin |
| The Lafayette Hotel & Swim Club, San Diego | Unverified (reopened Jul 2023) | Post Company interiors; mahogany bowling bar | 2026 status, official name, rooms, most palettes |
| InterContinental San Diego | Unverified | Opened 2018 (not 2022); Portman; Linda Snyder Associates; "coastal" | Everything color-related |
| Regent Santa Monica Beach | Unverified | Former Loews (1989); about $150M conversion; IHG flagship | Reopening date, designers, palette |
| Four Seasons Hotel Nashville | Open (Bacco opened Apr 2026) | Walnut, weathered steel, neutral lobby with blues and greens; 2,300 sq ft pool; Two MICHELIN Keys | Bacco and rooftop colors |
| Noelle, Nashville | Open (inferred) | Pink and green marble, terrazzo, brass; navy or white rooms; Trade Room; Rare Bird | Stone naming conflict; 2026 confirmation |
| The Charleston Place | Unverified | Independent since Mar 2022 (Beemok); renovation planned from 2023 | Renovation outcome, designers, palette |
| The Omni Grove Park Inn | Not researched | Nothing yet | Hurricane Helene (2024) impact and status first |
| "Biltmore" | Not researched | Which Biltmore is undecided | Your pick |
| Fairmont Austin | Open (Aug 2026 brochure) | Blue/white/honey rooms; Fulton blue and dark wood; pink-rock spa chandelier; brick food hall | Restaurant and rooftop bar colors |
| The Post Oak Hotel, Houston | Open (2026 awards) | Calacatta and ebony lobby; pink and purple Bloom & Bee; Presidential Suite palette | Rooms, pool, spa colors |
| JW Marriott Houston Downtown | Unverified | 2014 adaptive reuse of the c.1910 Carter Building; Gensler, Wilson Associates, MBCM | Palette |
| Hilton Americas-Houston | Unverified | Renovation history only | Nearly everything |
| Four Seasons Hotel New York (57th St) | Open (2026 releases) | Honey limestone, honey marble, red velvet TY Bar, forest-like Garden, tan/cream/white rooms | Lobby floor conflict; spa |
| Four Seasons Hotel New York Downtown | Unverified (open through Oct 2025) | Ivory/brown/bronze/gold lobby; light blue/gray/taupe rooms | 2026 status |
| New York Hilton Midtown | Not researched | Nothing yet | Everything |
| InterContinental Chicago Magnificent Mile | Unverified | "Art Deco structure"; renovations 2013 and 2023 | Era, venues, palette (strong candidate) |
| Fairmont Olympic Hotel, Seattle | Unverified | Opened 1924; Trinity Investments bought it Dec 2024; 450 rooms | Palette, venues, 2026 management |
| Kimpton picks (Palomar DC, Monaco Pittsburgh, Ashbel NY) | Ashbel Open (Apr 2026); others Unverified | Palomar rooms in marigold, union blue, oxford white; Monaco in yellow, black and white | West, Mountain and Midwest Kimptons |
| Melia | Not researched | Two leads from memory (Orlando Celebration; INNSIDE NoMad) | Whether Melia has anything worth including in the US |
| Madonna Inn (candidate) | Open (2026 coverage) | Pink everything; pink-and-gold Gold Rush Steak House | Room-level colors |
| Parker and Saguaro, Palm Springs (candidates) | Unverified | Adler's color philosophy; Saguaro's 12-tone wildflower facade | 2026 status |

All URLs are in the workbook (Sources tab) and in data/seed/hotels.json.

## 2. Booking infrastructure (what a pre-revenue startup can actually use)

| Option | What the research found | Fit now |
|---|---|---|
| Expedia Group affiliate program | "Up to 4%" per eligible booking; links, widgets, APIs ([Expedia](https://partner.expediagroup.com/en-us/solutions/explore-our-affiliate-program)) | Yes |
| Expedia Rapid API | Partner approval and certification to go live; content API groups images by property area with category IDs; 29M+ property images ([docs](https://developers.expediagroup.com/rapid/lodging/content/content-reference-lists), [overview](https://developers.expediagroup.com/docs/rapid)) | Later |
| Booking.com affiliate | Ended many direct partnerships June 20, 2025; now via Awin or CJ, up to 4% ([Net Influencer](https://www.netinfluencer.com/booking-com-moves-all-affiliates-to-awin-what-to-know-about-termination-notices), [Awin](https://www.awin.com/us/advertisers/partner/booking.com)). Demand API needs Managed Affiliate Partner status ([docs](https://developers.booking.com/demand/docs/getting-started/prerequisites)) | Yes (links); API later |
| Stay22 | Embeddable map, "no API dependency", Booking or Expedia as provider ([docs](https://dev.stay22.com/docs/maps)) | Yes, fastest |
| Agoda, Priceline | About 4-7% and 3-7% per third-party sources ([Agoda](https://www.creator-hero.com/de/blog/agoda-affiliate-program-in-depth-review-pros-and-cons), [Priceline](https://www.referly.so/affiliate-programs/priceline)) | Maybe |
| Travelpayouts | Link offers only; its hotel API (Hotellook) closed ([FAQ](https://support.travelpayouts.com/hc/en-us/articles/29534131568530-FAQ-on-the-closure-of-Hotellook)) | Links only |
| Hotelbeds | B2B net-rate wholesaler; test keys at 50 requests a day ([docs](https://developer.hotelbeds.com/documentation/)) | No (merchant model) |
| Amadeus Self-Service | Whole self-service portal decommissioned; keys disabled July 17, 2026 ([PhocusWire](https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers)) | No |

**The photo question:** no source found grants rights to download, modify or run computer vision on partner photos. Booking.com reportedly forbids downloading or altering images ([AltexSoft summary](https://www.altexsoft.com/blog/booking-com-partnerships-apis-extranet-pulse-app/)); Sabre says its hotel images may not be cached or stored ([Sabre](https://developer.sabre.com/docs/rest_apis/hotel/search/get_hotel_media_v2)). Conclusion: measured palettes should come from your own shoots and from hotels that grant permission, not from scraped partner photos, until a partner says yes in writing.

## 3. Competitors and adjacent products

- **Big platforms are moving to describe-what-you-want search:** Booking.com Smart Filter (free-text filters, late 2024) ([Booking Holdings](https://www.bookingholdings.com/press-releases/booking-com-enhances-travel-planning-with-new-ai-powered-features-for-easier-smarter-decisions/)); Airbnb natural-language search (tested Feb 2026, wider rollout fall 2026) ([Dataconomy](https://dataconomy.com/2026/02/16/airbnb-tests-natural-language-ai-search-tool-for-trip-bookings/)); Google AI Mode hotel booking (US test, Aug 2026) ([Hotel Dive](https://www.hoteldive.com/news/google-introduces-ai-mode-hotel-booking/829265/)); Expedia's Romie assistant ([Travel Market Report](https://travelmarketreport.com/RetailStrategies/articles/Expedia-Unveils-Romie-an-AI-Powered-Travel-Planner)).
- **None found offers search by color palette or space-level aesthetics.** The closest analogs are Google Images' color filter (general images) and the old Topshop x Pinterest Palettes campaign ([MarTech](https://martech.org/topshop-pinterest-unveil-pinterest-palettes-for-fashion-week-fans-shoppers)).
- **Accidentally Wes Anderson** is the closest brand in spirit: a community, books, and travel content (with Skyscanner in Aug 2025), but no color search or booking ([Afar](https://www.afar.com/magazine/how-to-find-wes-anderson-style-whimsy-wherever-you-travel), [Skyscanner](https://www.skyscanner.com/author/accidentally-wes-anderson)).
- **Not researched yet:** Mindtrip, Layla, Tripadvisor, Kayak, Perplexity, design-curated platforms (Design Hotels, Tablet, Mr & Mrs Smith, Small Luxury Hotels).
- **Read:** the moat is not "AI search" (the giants have it). It is the measured, space-level color dataset and the content and community around it.

## 4. Rights (leads only, not verified this session, not legal advice)

The rights agent ran out of searches before reaching legal sources. These leads come from model memory and should be confirmed with an IP attorney:

- Facts and mere color variations are generally not copyrightable (Feist v. Rural, 1991; 37 C.F.R. 202.1(a)). Extracting a palette from an image you are allowed to view is a different act from republishing the image, but copying an image to analyze it can still raise fair use questions (recent AI cases include Thomson Reuters v. Ross, Bartz v. Anthropic and Kadrey v. Meta, all 2025).
- Embedding social posts: courts have split on the "server test" (Ninth Circuit vs some Southern District of New York decisions). Get permission or link out.
- People in frame: state right-of-publicity laws (for example New York Civil Rights Law 50-51, California Civil Code 3344). Avoid identifiable guests.
- Interior design can be protected as architectural work or trade dress in some cases; single colors can be trademarks in a specific context (Qualitex, 1995). Publishing a hotel's palette as data is unlikely to be the problem; using it to imply endorsement could be.

## 5. Not researched this pass

- Trademark search for COLORWAYS (classes 9, 35, 39, 42, 43) and domain availability.
- Market sizing, set-jetting and social-media booking influence.
- Grove Park Inn, the Biltmore choice, New York Hilton Midtown, Melia, most of the candidate list (Beverly Hills Hotel, Greenbrier, Colony Palm Beach, Faena, and others).
- Vision-model pricing: not needed yet, because the prototype measures color with plain math in the browser (no AI calls).

## 6. Next pass plan (fits one turn's search budget)

Run at most four agents so the 200-search cap goes further, about three searches per hotel, one domain per search:

1. Wave 1 gaps (about 60 searches): Grove Park Inn, your Biltmore pick, Hilton Midtown, InterContinental Chicago, Fairmont Olympic, Charleston Place, Regent Santa Monica, Virgin Las Vegas.
2. Candidates (about 45): 15 from the backlog, status first.
3. Business (about 40): trademark, Melia US, design-curated competitors, market sizing.
4. Rights (about 30): confirm the leads above with primary or law-firm sources.

If the hosts listed at the top are allowed in the environment's network settings, agents can read full pages and quote them directly instead of from excerpts.
