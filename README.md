# LegoStorageApp — 🧱 Brick Finder

A phone-friendly web app to help the family organize a LEGO collection and quickly
**find** (“which bin are the red 2×4s in?”) and **identify** (“what is this piece?”) parts.

No build step, no dependencies, no account needed. It's plain HTML/CSS/JavaScript (ES modules).

## Features

| Tab | What it does |
| --- | --- |
| 🔍 **Find** | Instant search across part number, name, color, category, bin and notes. Understands `red 2x4`, `2 by 4`, `3001`, `technic tub`. Filter by category chips, color and bin. Use **+ / −** to adjust counts as you build. |
| 📷 **Identify** | Take a photo of a part and get likely matches from [Brickognize](https://brickognize.com) (free, no key). Or look it up by number or name on [Rebrickable](https://rebrickable.com) (free API key). Each result shows **whether you already own it and which bin it's in**, or **which bin to sort it into**. |
| ➕ **Add** | Add parts to a bin. The app **suggests the right bin** from each bin's rules and from where that part is already stored, which helps when sorting a pile. Color and bin are remembered between adds, which speeds up sorting a big pile. Adding the same part, color and bin again increases the count instead of making a duplicate row. |
| 🗄️ **Bins** | Create a page for each container (drawer, tub, bag). On it you can **catalog what's inside** with a quick add form that stays on that bin, and set **what goes in this bin**: kinds of parts, specific part numbers and/or colors. Also **print bin labels**. |
| ⚙️ **Settings** | Export/import the collection to share between family devices (merge or replace), set the Rebrickable key, and load sample data. |

## Run it

```bash
npm start          # http://localhost:8080  (zero-dependency static server, Node 20+)
npm test           # unit tests (node:test)
```

ES modules don't load from `file://`, so serve the folder rather than double-clicking `index.html`.
Any static host works. For example, enable **GitHub Pages** on this repo and open the URL on everyone's phones.
Then use "Add to Home Screen" to get an app icon.

## How data is stored and shared

- The collection lives in the browser's `localStorage` on each device.
- To share, go to **Settings → Export** and send the `.json` file (AirDrop, email, Drive…). On the other device, choose **Import** with *Merge* checked.
  Merge keeps both sides' new parts. When the same part was edited on both devices, the newer edit wins.
- The Rebrickable API key is never included in exports.

## Project layout

```
index.html            app shell + bottom tab bar
css/styles.css        mobile-first styles, dark mode, print labels
js/app.js             views and hash router (#/find, #/identify, #/add, #/edit/:id, #/bins, #/bin/:id, #/settings)
js/store.js           data model, persistence, import/export/merge
js/search.js          tokenized, scored search + filters
js/sorting.js         bin suggestions ("where does this go?") + category guessing
js/identify.js        Brickognize photo recognition, Rebrickable lookups
js/data/              colors (Rebrickable IDs), categories, sample collection
scripts/serve.js      local dev server
tests/                node:test unit tests
```

## Ideas for next steps

- Real-time family sync (e.g. Firebase/Supabase) instead of export/import.
- Import a set's parts list from Rebrickable by set number ("we got set 60337").
- "Can we build it?": compare a set's inventory against the collection.
- Bin QR codes: scan a bin's label to open its contents.
- Make it an offline-capable PWA (manifest + service worker).
