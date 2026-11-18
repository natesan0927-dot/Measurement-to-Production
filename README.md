# Measurement to Production

Site measurement → approval → production sheet, for TITANS WINDOWS.

**Online app: https://measurement-to-production.vercel.app** (Vercel; pushing to `main` on GitHub updates it).
On a phone, open it and choose *Add to Home screen* to install it as an app.

## How it works

1. **Jobs** – start a new job for each site visit (job numbers M2P-0001, M2P-0002, …).
   Enter customer, phone, site, address, measured by and date.
2. **Measurement** – add a **Window** (W1, W2, …) or **Ventilator** (V1, V2, …). The code continues by itself and can be changed.
   Each item is **one line**: code | 3 widths (**left, centre, right**) | 3 heights (**top, middle, bottom**) | design.
   - **Design** opens a key pad: tap SL, OP, TH, BH, FIX, VENT, FAN, MESH, DOOR … to draft it (e.g. `SL SL MESH`, `OP FIX OP`).
     New codes can be added right in the key pad (**+ New code**), and **✎ Edit codes** changes or deletes them.
     They can also be managed under Settings.
   - **Design drawing**: the design codes are drawn as a window to its width × height (sliding arrows,
     opening triangles, fixed panes, fan, mesh, arch), on the measurement, the approval and the production sheet.
   - **Location, colour and glass** are always shown under the measurements. A new item starts as **White**,
     with **5 mm Clear** glass for a window and **5 mm Pinned** for a ventilator; pick another from the list (locations: Hall, Kitchen, Master bedroom, …),
     or **Other…** to type a new one (it is then kept in the list). The starting colour and glass, and the location / colour / glass lists, can be changed under Settings.
   - **⋯** opens the rest: quantity, remarks, photo, type, move and delete.

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
4. **Production sheet** – lists the approved items: code, final width × height, quantity, design, colour, glass and remarks,
   with **4 empty boxes per window for the cutting sizes** the production team works out and writes in by hand, and the total quantity,
   ready to print or save as PDF (A4 landscape) for the factory.

**Left sidebar** (on a PC, like the quotation software): Jobs, New job, the open job with its three stages
(Measurement, Review & approve, Production sheet: the current one highlighted, with counts) and Settings.

The 8 mm limit, the design keys and the colour / glass suggestion lists can be changed under **Settings**.

## Where the data is kept

On the device itself (browser storage, room for photos). It works with no internet on site and can be installed
as an app on a phone ("Add to Home screen"). Use *Settings → Download backup* to keep a copy or move jobs to another device.

## Files

| File | What it does |
|---|---|
| `index.html` | The page |
| `app.js` | The screens: jobs, measurement, review & approve, production sheet, settings |
| `drawing.js` | Draws a window from its design codes |
| `rules.js` | The measurement rules (least size, 8 mm difference check) |
| `config.js` | Company name, job number prefix, 8 mm limit, design and glass lists |
| `db.js` | Saving on the device |
| `style.css` | Look of the app and the printed sheet |
| `sw.js`, `manifest.webmanifest` | Installable app, works offline |

## Running it

It is a plain static site: no build step. It runs on Vercel from the `main` branch.

Making changes: work on the `dev` branch and run `python dev.py`, then open http://localhost:8811.
The page reloads by itself every time a file is saved. When the changes are approved, merge `dev` into `main`;
that updates the online app.
