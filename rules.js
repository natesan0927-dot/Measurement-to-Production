/*
 * The measurement rules, in one place.
 *
 * Each item has 3 widths (left, centre, right) and 3 heights (top, middle, bottom).
 *  - difference = largest - smallest
 *  - if the difference of the widths or of the heights is more than the tolerance (8 mm),
 *    the item is flagged (shown in red) and must be checked before it is approved
 *  - the size offered for production is the smallest width x the smallest height
 *    (it can be edited before approving)
 */
window.RULES = (function () {
  function nums(arr) {
    return (arr || []).map((v) => (v === '' || v == null ? NaN : Number(v)));
  }
  function stats(arr) {
    const n = nums(arr);
    const filled = n.filter((v) => isFinite(v) && v > 0);
    const complete = filled.length === 3;
    if (!filled.length) return { complete: false, count: 0, min: null, max: null, diff: null };
    const min = Math.min(...filled), max = Math.max(...filled);
    return { complete, count: filled.length, min, max, diff: max - min };
  }
  function check(item, tol) {
    const w = stats(item.w), h = stats(item.h);
    const complete = w.complete && h.complete;
    const wOver = w.diff != null && w.diff > tol;
    const hOver = h.diff != null && h.diff > tol;
    return { w, h, complete, wOver, hOver, flagged: wOver || hOver };
  }
  // what the approval was given for; if the measurements change later, the approval is dropped
  function signature(item) {
    return JSON.stringify([item.w, item.h]);
  }
  return { stats, check, signature };
})();
