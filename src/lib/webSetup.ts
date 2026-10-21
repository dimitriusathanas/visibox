import { Platform } from 'react-native';

// Mobile browsers turn sideways swipes into "back" and downward drags into
// pull-to-refresh, and long presses into text selection or a callout menu.
// All of those fight the item gestures, so switch them off for the app page.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = [
    'html, body { overscroll-behavior: none; }',
    'body { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }',
    'input, textarea { user-select: text; -webkit-user-select: text; }',
    // RNGH 3.3 can reset the detector's pan-y to none when rows re-register.
    // Keep vertical browser scrolling available while horizontal gestures run in JS.
    '[data-testid="food-row-swipe"] { touch-action: pan-y !important; }',
  ].join('\n');
  document.head.appendChild(style);
}
