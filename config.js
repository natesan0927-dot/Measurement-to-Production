/*
 * Company details and the default lists. Change them here.
 * (The tolerance and the suggestion lists can also be changed in the app, under Settings.)
 */
window.CONFIG = {
  company: 'TITANS WINDOWS',
  jobPrefix: 'M2P-',            // job numbers: M2P-0001, M2P-0002, ...

  // Most a set of three measurements may differ (largest minus smallest) before it is flagged
  toleranceMm: 8,

  // Item types. The code continues per type: W1, W2, W3 ... and V1, V2 ...
  types: [
    { key: 'W', label: 'Window', prefix: 'W' },
    { key: 'V', label: 'Ventilator', prefix: 'V' },
  ],

  designs: [
    '2 Track Sliding', '3 Track Sliding', '2 Track Sliding with Mesh', 'Casement - Single',
    'Casement - Double', 'Fixed', 'Top Hung', 'Bottom Hung', 'Tilt & Turn',
    'Sliding Door', 'Casement Door', 'Ventilator - Fixed', 'Ventilator - Top Hung', 'Louvers',
  ],
  colours: [
    'White', 'Ivory', 'Golden Oak', 'Walnut', 'Mahogany', 'Anthracite Grey', 'Black', 'White inside / Golden Oak outside',
  ],
  glass: [
    '5 mm Clear', '6 mm Clear', '5 mm Frosted', '5 mm Toughened Clear', '6 mm Toughened Clear',
    '8 mm Toughened Clear', '5 mm Reflective', '6+12+6 DGU', '5 mm Laminated',
  ],
};
