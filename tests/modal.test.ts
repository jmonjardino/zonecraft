// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import { grabHoldsInput } from '../src/runtime/modal.js';

describe('grabHoldsInput', () => {
  it('uses the seat state on GNOME Shell 49', () => {
    expect(grabHoldsInput({ get_seat_state: () => 3 })).toBe(true);
    expect(grabHoldsInput({ get_seat_state: () => 0 })).toBe(false);
    expect(grabHoldsInput({ get_seat_state: () => 7 }, 7)).toBe(false);
  });

  it('uses is_revoked() on GNOME Shell 50 and later, which have no seat state', () => {
    expect(grabHoldsInput({ is_revoked: () => false })).toBe(true);
    expect(grabHoldsInput({ is_revoked: () => true })).toBe(false);
  });

  it('treats a missing grab as failed and an unknown grab as held', () => {
    expect(grabHoldsInput(null)).toBe(false);
    expect(grabHoldsInput(undefined)).toBe(false);
    expect(grabHoldsInput({})).toBe(true);
  });
});
