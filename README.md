# LegoStorageApp — 🧱 Brick Finder

A phone-friendly web app to help the family catalog a LEGO collection that is **sorted by part, not color**, and quickly
**find** ("which drawer are the 1×2 plates in?") and **identify** ("what is this piece, and where does it go?") parts.

No build step, no dependencies, no account needed. It's plain HTML/CSS/JavaScript (ES modules).

## How storage is described

- **Storage unit:** a drawer cabinet, a divided case or a tub with compartments. Each unit has a letter code (`A`, `B`, …) and a layout: the number of drawers or compartments in each row, top to bottom. A cabinet with 5 rows of 6 small drawers and 3 rows of 3 large ones is `6, 6, 6, 6, 6, 3, 3, 3`.
- **Slot:** one drawer or compartment, named **unit-row-column**. `A-7-1` is cabinet A, row 7, first drawer. A slot holds one or more part numbers, with all colors mixed. A slot can also have a name such as "Hinges" for mixed compartments.
- **Part:** a part number, any alternate numbers for the same part (e.g. `15573 / 3794`), a name and a kind (Plates, Tiles…). A part can live in more than one slot, for example when a drawer overflows.

Piece counts and colors aren't tracked. The app answers "which slot is it in?"

## Features

| Tab | What it does |
| --- | --- |
| 🔍 **Find** | Instant search by part number, alternate number, name (`1x2 plate`, `tile 2 by 2`) or slot code. Results show their slot codes, and a **map of the cabinet** highlights the drawers. Type a slot code and press Enter to jump to that slot. |
| 📷 **Identify** | Take a photo of a part and get likely matches from [Brickognize](https://brickognize.com) (free, no key). Or look it up by number or name. Each result shows **which slot it goes in**, or offers to give it a slot. |
| 🗄️ **Storage** | Add storage units (presets for common cabinets and cases) and see a map of each one. Tap a drawer to open its slot, where you can type the part numbers from its label (`3623, 63864`). Names are filled in for known parts. **← / →** steps through every slot in order, to catalog a whole cabinet in one go. Parts that have no slot yet are listed here too. |
| 🏷️ **Labels** | Print labels for slots that need one (any slot whose contents changed) or for a whole unit. Choose a **full label** (code, part names and numbers) or a **code sticker** to put next to an existing Brick Architect label. |
| ⚙️ **Settings** | Export/import the catalog to share between family devices (merge or replace), set the Rebrickable key, and load sample data. |

Data saved by earlier versions of the app (bins with per-color counts) is converted automatically: each old bin becomes a slot of an "Imported bins" unit `Z`.

## Run it

```bash
npm start          # http://localhost:8080  (zero-dependency static server, Node 20+)
npm test           # unit tests (node:test)
```

ES modules don't load from `file://`, so serve the folder rather than double-clicking `index.html`.
Any static host works. For example, enable **GitHub Pages** on this repo and open the URL on everyone's phones.
Then use "Add to Home Screen" to get an app icon.

## How data is stored and shared

- The catalog lives in the browser's `localStorage` on each device.
- To share, go to **Settings → Export** and send the `.json` file (AirDrop, email, Drive…). On the other device, choose **Import** with *Merge* checked.
  Merge keeps both sides' additions. When the same slot or part was edited on both devices, the newer edit wins.
- The Rebrickable API key is never included in exports.

## Part names

`js/data/catalog.js` has built-in names for common bricks, plates and tiles. It also includes the parts on the family's Brick Architect drawer labels, so typing a number fills in the name even offline.
For other parts, type the name yourself or look the part up in **Identify** (Rebrickable key needed for number/name lookups).
To add more built-in names, add lines to `catalog.js`.

## Project layout

```
index.html            app shell + bottom tab bar
css/styles.css        mobile-first styles, dark mode, storage maps, printable labels
js/app.js             views and hash router (#/find, #/identify, #/part/:num, #/storage, #/unit/:id, #/slot/:id, #/labels, #/settings)
js/store.js           data model (units, slots, parts), persistence, import/export/merge, v1 migration
js/search.js          tokenized, scored search across numbers, names and slot codes
js/sorting.js         guesses the kind of part from its name
js/identify.js        Brickognize photo recognition, Rebrickable lookups
js/data/              built-in part catalog, categories, sample data
scripts/serve.js      local dev server
tests/                node:test unit tests
```

## Ideas for next steps

- Optional piece counts per slot ("a few / some / lots").
- Real-time family sync (e.g. Firebase/Supabase) instead of export/import.
- Import a set's parts list from Rebrickable and show which slots to pull from.
- Slots that span two columns, for cases with uneven compartments.
- Bin QR codes: scan a drawer's label to open its slot.
