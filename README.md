# LegoStorageApp — 🧱 Brick Finder

A phone-friendly web app to help the family catalog a LEGO collection that is **sorted by part, not color**, and quickly
**find** ("which drawer are the 1×2 plates in?") and **identify** ("what is this piece, and where does it go?") parts.

No build step and no account needed. It's plain HTML/CSS/JavaScript (ES modules); the only bundled library is the Anthropic SDK, used for reading cabinets from photos.

## How storage is described

- **Storage unit:** a drawer cabinet, a divided case or a tub with compartments. Each unit has a letter code (`A`, `B`, …) and a layout: the number of drawers or compartments in each row, top to bottom. A cabinet with 5 rows of 6 small drawers and 3 rows of 3 large ones is `6, 6, 6, 6, 6, 3, 3, 3`.
- **Slot:** one drawer or compartment, named **unit-row-column**. `A-7-1` is cabinet A, row 7, first drawer. A slot holds one or more part numbers, with all colors mixed. A slot can also have a name such as "Hinges" for mixed compartments.
- **Compartments:** a drawer can be divided into up to 8 compartments, each holding one kind of part. The map shows how
  full a divided drawer is (e.g. `3/8`).
- **Part:** a part number, any alternate numbers for the same part (e.g. `15573 / 3794`), a name and a kind (Plates, Tiles…). A part can live in more than one slot, for example when a drawer overflows.

Piece counts and colors aren't tracked. The app answers "which slot is it in?"

## Features

| Tab | What it does |
| --- | --- |
| 🔍 **Find** | Instant search by part number, alternate number, name (`1x2 plate`, `tile 2 by 2`) or slot code. Results show their slot codes, and a **map of the cabinet** highlights the drawers. Type a slot code and press Enter to jump to that slot. |
| 📷 **Identify** | Take a photo of a part and get likely matches from [Brickognize](https://brickognize.com) (free, no key). Or look it up by number or name. Each result shows **which slot it goes in**, or offers to give it a slot. |
| 🗄️ **Storage** | **Add a storage unit from a photo:** photograph a whole labeled cabinet, and Claude reads the layout and every Brick Architect label. You check each drawer (hard-to-read ones are highlighted) and fix anything before it's saved. Or add storage units (presets for common cabinets and cases) and see a map of each one. Tap a drawer to open its slot, where you can type the part numbers from its label (`3623, 63864`) or snap a 📷 photo of a part and tap the right match. Names (and pictures) come from the built-in list, the photo match, or Rebrickable when a Rebrickable key is set; Settings can look up names for any parts still missing one. Names someone typed are never overwritten. **← / →** steps through every slot in order, to catalog a whole cabinet in one go. Parts that have no slot yet are listed here too. |
| 💡 **Suggested spots** | A part without a slot (on its page, or in Identify results) gets suggestions for where to put it, based on its shape: kind (plate, tile, brick…), size and details like "corner". First choice is a divided drawer with free compartments holding like pieces, then an empty drawer next to like pieces. Tap a suggestion to put the part there. |
| 🏷️ **Labels** | Drawers whose contents changed go on a "Needs a label" list (or pick a whole unit). The default is **Brick Architect** labels: one official 12 mm P-touch label per part (`brickarchitect.com/label/<number>.lbx`), downloaded one by one or all at once, then printed from P-touch Editor. Each part's page and drawer page also link to its label, and a part can point at a different label number. The app's own slot-code and full labels are still available. |
| ⚙️ **Settings** | Export/import the catalog to share between family devices (merge or replace), set the Rebrickable and Anthropic API keys, and load sample data. |

Data saved by earlier versions of the app (bins with per-color counts) is converted automatically: each old bin becomes a slot of an "Imported bins" unit `Z`.

## Run it

```bash
npm start          # http://localhost:8080  (zero-dependency static server, Node 20+)
npm test           # unit tests (node:test)
```

ES modules don't load from `file://`, so serve the folder rather than double-clicking `index.html`.
Any static host works. For example, enable **GitHub Pages** on this repo and open the URL on everyone's phones.
Then use "Add to Home Screen" to get an app icon.

## Reading cabinets from photos

The **Add a storage unit from a photo** screen sends one photo to Claude (`claude-opus-5-5`) using structured output,
so the reply is always a grid of rows → drawers → parts (`js/scan.js`). Nothing is saved until the family reviews it.

- It needs an Anthropic API key (console.anthropic.com → API keys) entered in **Settings**. The key is stored only on
  that device and is never included in exports. Calls go straight from the browser to Anthropic.
- Each photo costs roughly 10–20¢. Photos are downscaled to 2400 px on the long side before upload.
- Best results: one straight-on photo per unit, all edges in frame, no glare. Very large units can be photographed in halves.
- The SDK is bundled into `js/vendor/anthropic-sdk.js`. To update it, change the version in `package.json`, then run
  `npm install && npm run vendor:sdk`.

## Family sharing (Firebase)

With sharing on, the family signs in with Google and everyone sees the same catalog. Edits show up on the
other phones within a second or two, deletions included. Phones keep working offline and catch up when back
online. Without sharing, each phone keeps its own copy (see below).

How it works: `js/sync.js` keeps the phone's catalog and a shared copy in Firestore in step, one document per
storage unit, slot and part, so people editing different drawers never clash (same drawer: last save wins).
`js/firebase-backend.js` is the Firebase part, and the SDK is bundled into `js/vendor/firebase.js`
(`npm run vendor:firebase`), loaded only on phones that use sharing.

**One-time setup** (Firebase's free plan is plenty for a family):

1. At [console.firebase.google.com](https://console.firebase.google.com), create a project (Google Analytics not needed).
2. **Authentication → Sign-in method:** enable **Google**.
3. **Authentication → Settings → Authorized domains:** add the app's address, e.g. `yourname.github.io`.
4. **Firestore Database → Create database** (production mode).
5. **Firestore Database → Rules:** paste `firestore.rules` with the family's Google addresses (lowercase) in place of
   the examples, then **Publish**. These rules are what keep the data private, so keep the real addresses out of this
   public repo.
6. **Project settings → General → Your apps → Web app:** register an app and copy its `firebaseConfig` into
   `js/firebase-config.js` (`FIREBASE_CONFIG`). These values only identify the project and are safe to commit.

Then on each phone: **Settings → Family sharing → Set up sharing → Sign in with Google**. The first phone starts the
family catalog with what it has; the next one can use the family catalog or combine it with its own.

To add or remove someone, edit the address list in the Firestore rules and publish again.

## Part numbers

The app uses **BrickLink/LEGO part numbers** everywhere, the same ones on Brick Architect labels and in Brickognize
photo matches. Rebrickable has its own numbering, so it is only used to fill in names and pictures: a number is looked
up there by its BrickLink number, then its LEGO number, and the app keeps the number you entered. Rebrickable's own
numbers are never shown or saved.

## How data is stored and shared

- The catalog lives in the browser's `localStorage` on each device (with family sharing on, that's a copy of the shared catalog).
- Without family sharing, go to **Settings → Export** and send the `.json` file (AirDrop, email, Drive…). On the other device, choose **Import** with *Merge* checked.
  Merge keeps both sides' additions. When the same slot or part was edited on both devices, the newer edit wins.
- API keys (Rebrickable, Anthropic) are never included in exports.

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
js/sorting.js         part kinds and shapes, "where should this go?" suggestions
js/labels.js          Brick Architect label addresses
js/identify.js        Brickognize photo recognition, Rebrickable lookups
js/scan.js            reads a whole storage unit from a photo with Claude
js/sync.js            family sharing: keeps the phone and the shared copy in step
js/firebase-backend.js  Google sign-in and Firestore for family sharing
js/firebase-config.js the family's Firebase project settings
js/vendor/            bundled Anthropic and Firebase SDKs (`npm run vendor:sdk`, `npm run vendor:firebase`)
firestore.rules       template for the Firestore security rules (who can see the shared catalog)
js/data/              built-in part catalog, categories, sample data
scripts/serve.js      local dev server
scripts/*-entry.js    entry points for the SDK bundles
tests/                node:test unit tests
```

## Ideas for next steps

- Optional piece counts per slot ("a few / some / lots").
- Import a set's parts list from Rebrickable and show which slots to pull from.
- Slots that span two columns, for cases with uneven compartments.
- Bin QR codes: scan a drawer's label to open its slot.
