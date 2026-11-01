// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Whether a `Clutter.Grab` returned by `Main.pushModal()` really holds the input.
 *
 * GNOME Shell 49 reports this through `get_seat_state()`, which returns
 * `Clutter.GrabState.NONE` (0) for a grab that took nothing. GNOME Shell 50
 * removed that method and `Clutter.GrabState`; a grab there exposes only
 * `is_revoked()`. Calling the old method on GNOME 50 threw after the modal had
 * been pushed, which left an overlay on screen that nothing could close.
 */
export function grabHoldsInput(grab: any, grabStateNone = 0): boolean {
  if (!grab) return false;
  if (typeof grab.get_seat_state === 'function') return grab.get_seat_state() !== grabStateNone;
  if (typeof grab.is_revoked === 'function') return !grab.is_revoked();
  return true;
}
