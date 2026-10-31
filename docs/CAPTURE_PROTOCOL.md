# Capture protocol: shooting hotels for measurable color

_Field guide for your own photo and video shoots. Goal: colors you can trust enough to mark **Measured**, captured the same way at every property so stripes are comparable._

## Before the trip

1. **Get permission.** Email the hotel's PR or marketing contact. Ask for: permission to photograph public spaces and one room for a color study, whether you may publish the images, floor areas (sq ft) for the spaces you will shoot, and their media kit with editorial terms. Log the answer in the workbook (Media_Sources and Capture_Log, Rights column).
2. **Plan the space list.** The Spaces tab already has a default capture plan per hotel (Arrival, Lobby, Lobby Bar, Room, Bath, Pool, Spa, Restaurant, Bar). Delete what does not exist; add named venues.
3. **Pack:** a gray card (18% gray) or a color checker chart, a phone or camera that shoots RAW (iPhone ProRAW or similar), a small gimbal for video, lens wipes.

## Settings

- Shoot **RAW** if you can. If not, turn off any "vivid" or filter mode.
- **Lock white balance** on the gray card at the start of each space (or shoot one frame with the card in it and correct later). Auto white balance "corrects" warm, moody rooms toward neutral, which erases the very color you are measuring.
- **Lock exposure** per space. Avoid blown windows: the Analyze tab can ignore blown highlights, but they still steal pixels.
- Avoid mixed light where possible (daylight plus warm bulbs). If the space is designed that way (a moody bar), shoot it as designed and note the lighting.

## Shot list per space (about 10 frames)

| # | Frame | Why |
|---|---|---|
| 1 | Gray card frame in the space's light | Calibration reference |
| 2-3 | Two wide establishing shots from the entrance, eye height | The honest "what you see walking in" share |
| 4-5 | Two wides from the opposite corners | Balances the framing bias of a single viewpoint |
| 6-8 | Material close-ups (floor, wall, upholstery, metal) | Accurate hexes for signature materials |
| 9-10 | The hero photo-op frame(s) | Where the key swatch comes from; drag a region on these in Analyze |

Use frames 2 to 5 for the space palette (they set the shares) and mark photo-op regions on 9 and 10.

## Walkthrough video (for the barcode)

- One continuous take, no cuts: curb, entrance, lobby, elevator, corridor, room, bath; optionally on to pool, bar or rooftop.
- Walk at a steady pace (about 60 to 120 seconds total). Lock exposure and white balance before you start.
- Keep the phone level, at chest height, pointed where a guest would look.
- No guests' faces: hotels and privacy law both care. Shoot early or ask staff for a quiet window.

## File naming

`HOTELID_SPACECODE_YYYYMMDD_###.ext` (for example `NSH-NOEL_LOB_20261114_001.dng`). Space codes come from the Lists tab (LOB, LBR, ROOM, BATH, POOL, SPA, REST, BAR, ROOF and so on).

## After the shoot

1. Color-correct RAW files with the gray card frame, export JPEGs (sRGB).
2. In the prototype, open **Analyze photos**, choose the hotel and space, drop frames 2 to 5 (plus 9 and 10), drag the photo-op regions, and save. Enter the published or measured area if you have it.
3. For the walkthrough, open **Walkthrough barcode**, generate, download the PNG and attach it to the hotel.
4. Export the Spaces and Swatches CSVs and paste them into the workbook (columns match). Set Capture_Status to Analyzed and fill in Capture_Log.
5. Replace the hotel's Described colors for that space, or keep both and compare. Measured wins in rankings.
