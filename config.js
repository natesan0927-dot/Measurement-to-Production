/*
 * Company details and the default lists. Change them here.
 * (The tolerance and the suggestion lists can also be changed in the app, under Settings.)
 */
window.CONFIG = {
  version: '1.9 · 18-11-2026',   // shown in the sidebar and Settings, to see which version is open
  company: 'TITANS WINDOWS',
  jobPrefix: 'M2P-',            // job numbers: M2P-0001, M2P-0002, ...

  // Most a set of three measurements may differ (largest minus smallest) before it is flagged
  toleranceMm: 8,

  // Item types. The code continues per type: W1, W2, W3 ... and V1, V2 ...
  types: [
    { key: 'W', label: 'Window', prefix: 'W' },
    { key: 'V', label: 'Ventilator', prefix: 'V' },
  ],

  // Keys on the design key pad. Tapping keys builds the design, e.g. "SL SL FIX" or "OP FIX OP".
  // [key, what it means]
  designKeys: [
    ['SL', 'Sliding'], ['OP', 'Openable'], ['TH', 'Top hung'], ['BH', 'Bottom hung'],
    ['FIX', 'Fixed'], ['VENT', 'Ventilator'], ['FAN', 'Exhaust fan'], ['MESH', 'Mosquito mesh'],
    ['DOOR', 'Door'], ['LOUV', 'Louvers'], ['T&T', 'Tilt & turn'], ['ARCH', 'Arch'],
  ],
  // What a new item starts with (can be changed on each item, and here under Settings in the app)
  defaults: {
    colour: 'White',
    glass: { W: '5 mm Clear', V: '5 mm Pinned' },   // windows / ventilators
  },
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
