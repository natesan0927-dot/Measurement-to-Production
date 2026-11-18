/*
 * Company details and the default lists. Change them here.
 * (The tolerance and the suggestion lists can also be changed in the app, under Settings.)
 */
window.CONFIG = {
  version: '1.22 · 19-11-2026',   // shown in the sidebar and Settings, to see which version is open
  company: 'TITANS WINDOWS',
  jobPrefix: 'M2P-',

  // Online storage for site photos (the same Supabase project as the quotation software).
  // One-time setup: run supabase/m2p-photos.sql in Supabase -> SQL Editor.
  supabaseUrl: 'https://hlfwltdulofupxxpedjp.supabase.co',
  supabaseKey: 'sb_publishable_nTPQID--zReOWkxBoMVBcA_SqFGB3wu',
  photoBucket: 'm2p-photos',            // job numbers: M2P-0001, M2P-0002, ...

  // Most a set of three measurements may differ (largest minus smallest) before it is flagged
  toleranceMm: 8,

  // Item types. The code continues per type: W1, W2, W3 ... and V1, V2 ...
  types: [
    { key: 'W', label: 'Window', prefix: 'W' },
    { key: 'V', label: 'Ventilator', prefix: 'V' },
  ],

  // Keys on the design key pad, the same codes as the quotation software.
  // Tapping keys builds the design, e.g. "SL SL M" (= SLSLM) or "OP OP" (= OPOP).
  // [key, what it means]
  designKeys: [
    ['SL', 'Sliding shutter'], ['OP', 'Openable shutter'], ['M', 'Mesh shutter'], ['FXD', 'Fixed'],
    ['DOOR', 'Casement door'], ['FXLUV', 'Fixed louvered vent'], ['LUVF', 'Vent with fan'], ['TH', 'Top hung'],
  ],
  // What a new item starts with (can be changed on each item, and here under Settings in the app)
  defaults: {
    colour: 'White',
    glass: { W: '5 mm Clear', V: '5 mm Pinned' },   // windows / ventilators
    section: { W: 'Inventa', V: 'Optima' },         // profile section: windows / ventilators
  },
  sections: ['Inventa', 'Optima'],
  locations: [
    'Hall', 'Living', 'Dining', 'Kitchen', 'Master bedroom', 'Bedroom 2', 'Bedroom 3', 'Kids bedroom',
    'Bathroom', 'Toilet', 'Pooja', 'Study', 'Balcony', 'Staircase', 'Utility', 'Store', 'Guest bedroom',
  ],
  colours: [
    'White', 'Ivory', 'Golden Oak', 'Walnut', 'Mahogany', 'Anthracite Grey', 'Black', 'White inside / Golden Oak outside',
  ],
  glass: [
    '5 mm Clear', '5 mm Pinned', '6 mm Clear', '5 mm Frosted', '5 mm Toughened Clear', '6 mm Toughened Clear',
    '8 mm Toughened Clear', '5 mm Reflective', '6+12+6 DGU', '5 mm Laminated',
  ],
};
