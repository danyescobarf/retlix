// Global page state: saves scroll + focused element index.
// Uses the global index among all [data-focusable] visible elements.

var _states = {};
var _restoring = false;

// Check if a restore is in progress (autofocus should back off)
export function isRestoring() { return _restoring; }
export function setRestoring(val) { _restoring = val; }

export function savePageState(key) {
  var all = document.querySelectorAll('[data-focusable]');
  var focusIdx = -1;
  var cur = document.activeElement;
  if (cur) {
    for (var i = 0; i < all.length; i++) {
      if (all[i] === cur) { focusIdx = i; break; }
    }
  }
  _states[key] = {
    scrollY: window.scrollY,
    focusIdx: focusIdx
  };
}

export function restorePageState(key, delay) {
  var state = _states[key];
  if (!state) return false;
  var d = delay || 300;
  _restoring = true;
  setTimeout(function() {
    window.scrollTo(0, state.scrollY || 0);
    if (state.focusIdx >= 0) {
      var all = document.querySelectorAll('[data-focusable]');
      // Try exact index first
      if (all[state.focusIdx] && all[state.focusIdx].offsetParent !== null) {
        all[state.focusIdx].focus();
      } else if (all.length > 0) {
        // Fallback: closest valid index
        var idx = Math.min(state.focusIdx, all.length - 1);
        if (all[idx]) all[idx].focus();
      }
    }
    setTimeout(function() { _restoring = false; }, 200);
  }, d);
  return true;
}

export function clearPageState(key) {
  delete _states[key];
}

export function hasPageState(key) {
  return !!_states[key];
}
