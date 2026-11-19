# Measurement to Production

Site measurement → approval → production sheet, for TITANS WINDOWS.

**Online app: https://measurement-to-production.vercel.app** (Vercel; pushing to `main` on GitHub updates it).
**Mobile app:** open the link on the phone and tap **📲 Install M2P app** (Android), or Share → *Add to Home Screen*
(iPhone). It installs with the **M2P** icon, opens full screen and works without internet. Icon source: `assets/src/m2p-icon.html`.

## How it works

1. **Jobs** – start a new job for each site visit (job numbers M2P-0001, M2P-0002, …).
   Enter customer, phone, site, address, measured by and date.
2. **Measurement** – add a **Window** (W1, W2, …) or **Ventilator** (V1, V2, …). The code continues by itself and can be changed.
   Each item is **one line**: code | 3 widths (**left, centre, right**) | 3 heights (**top, middle, bottom**) | design.
   - **Design** opens a key pad: tap SL, OP, TH, BH, FIX, VENT, FAN, MESH, DOOR … to draft it (e.g. `SL SL MESH`, `OP FIX OP`).
     New codes can be added right in the key pad (**+ New code**), and **✎ Edit codes** changes or deletes them.
     They can also be managed under Settings.
   - **Design codes** are the same as the quotation software: SL, OP, M (mesh), FXD, DOOR, FXLUV, LUVF, TH…
     ("SL SL M" = SLSLM). The design is shown as its codes only; no window drawings anywhere.
   - **Floor, location, colour, glass and section** are always shown under the measurements (a new window starts
     on the same floor as the one before).
     Section: **Inventa** for a window, **Optima** for a ventilator as standard. A new item starts as **White**,
     with **5 mm Clear** glass for a window and **5 mm Pinned** for a ventilator; pick another from the list (locations: Hall, Kitchen, Master bedroom, …),
     or **Other…** to type a new one (it is then kept in the list). The starting colour and glass, and the location / colour / glass lists, can be changed under Settings.
   - **⋯** opens the rest: remarks, **site photos**, type, move and delete.
     Site photos (optional, for the installation team) are kept on the phone and uploaded to Supabase as soon
     as there is internet: ↑ waiting, ✓ uploaded.

   Under each line the least size and the difference show straight away; the least boxes turn yellow
   and a set that differs by more than 8 mm turns red.
   Everything saves by itself while typing.
**One step at a time:** the job goes through three steps, each on its own page. The next step opens only
when the one before is done (the sidebar shows them, locked until then).

   When all windows are measured, **Mark complete & proceed** saves and opens the approval
   (it only goes ahead when every item has all 3 widths and 3 heights).
3. **Approval** – shows every item with its 3+3 measurements.
   - The **least width and least height** are highlighted and offered as the production size.
   - If the measurements differ by **more than 8 mm** (largest − smallest), the item is shown in red. It can still be approved with one tap.
   - The production size can be edited in place before approving.
   - *Approve all within 8 mm* approves every item that is complete and within the limit.
   - If a measurement is changed later, that item's approval is dropped and it has to be approved again.
   - **Generate production sheet** opens only when every item is approved.
4. **Production sheet** – lists the approved items: code, final width × height, section, design, colour, glass and remarks,
   with **4 empty boxes per window for the cutting sizes** the production team works out and writes in by hand, and the total,
   ready to print or save as PDF (A4 landscape) for the factory.

**Production in lots** (a job can go to the factory in parts):
- *Mark complete & proceed* works when only some windows are measured; the others show **Waiting for measurement**
  and can be measured later.
- **Generate production lot** opens a list of the windows: tick the ones ready to make now (any of them,
  e.g. W1, W5, W6, W15, W17, W20); they become the next lot (Lot 1, Lot 2, ...), in window order. The rest stay
  pending. Windows not measured, not approved or already in a lot are shown greyed out with the reason. Windows in a lot show **🔒 In production · Lot n** everywhere, their sizes
  are locked, and they are never put in another lot.
- **↩ Reverse Lot n** (in step 3) takes the whole lot back to approval; **↩ Take out of Lot n** (on a window in
  the approval page) does it for one window. They are unlocked to edit, then approved and put in a lot again.
- Step 3 shows one lot at a time (switch Lot 1 / Lot 2 at the top). Each sheet lists the earlier lots
  (not on this sheet) and the windows not in production yet, so nothing is made twice.

**Production sheets** (switch at the top of step 3): Factory sheet, Installation sheet and
**Summary**: tick the lots to include; it totals windows, ventilators and area (sq.ft), lists each lot, and
breaks the windows down by type, section, design, colour and glass with quantities and codes.

The sheets:
- **Factory sheet**, in this order: Code | W | H | Design | Glass | Colour | Section | 4 large cutting-size
  boxes (written in by hand) | Remarks (taking the rest of the width).
- **Installation sheet**: the same plus floor and location, and under each window a **link and QR code to its site photos**.
  Installers open it on any phone with no login (`photos.html`).

**One-time Supabase setup for site photos** (and `supabase/m2p-jobs.sql` for sharing jobs): open the quotation software's Supabase project → SQL Editor →
New query → paste `supabase/m2p-photos.sql` → Run. Until then photos stay on the phone with ↑ (waiting).

**Left sidebar** (on a PC, like the quotation software): Jobs, New job, the open job with its three stages
(Measurement, Review & approve, Production sheet: the current one highlighted, with counts) and Settings.

The 8 mm limit, the design keys and the colour / glass suggestion lists can be changed under **Settings**.

## Where the data is kept

**Shared by all phones and PCs** (no login), in the quotation software's Supabase project, and also on each
device so it works without internet on site. Changes are sent within seconds when there is internet and
fetched from the other devices on opening, every 20 seconds and when the internet returns; if two devices
change the same job, the newest change wins. Job numbers come from the server, so they never repeat.
The sidebar shows *Shared with all devices*, *Offline · n changes waiting* or *Online sharing not set up yet*.

**One-time setup:** Supabase → SQL Editor → New query → paste `supabase/m2p-jobs.sql` → Run.
Without a login, anyone with the app's link can see and change the jobs.

*Settings → Download backup* still makes a copy of everything.

## Files

| File | What it does |
|---|---|
| `index.html` | The page |
| `app.js` | The screens: jobs, measurement, review & approve, production sheet, settings |
| `rules.js` | The measurement rules (least size, 8 mm difference check) |
| `config.js` | Company name, job number prefix, 8 mm limit, design and glass lists |
| `photos.js`, `photos.html` | Site photos: upload to Supabase, and the page installers open from the link |
| `vendor/qrcode.js` | QR codes on the installation sheet (MIT licence, by Kazuhiko Arase) |
| `sync.js` | Sharing jobs and settings between devices through Supabase |
| `db.js` | Saving on the device |
| `style.css` | Look of the app and the printed sheet |
| `sw.js`, `manifest.webmanifest` | Installable app, works offline |

## Running it

It is a plain static site: no build step. It runs on Vercel from the `main` branch.

Making changes: work on the `dev` branch and run `python dev.py`, then open http://localhost:8811.
The page reloads by itself every time a file is saved. When the changes are approved, merge `dev` into `main`;
that updates the online app.
