// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { calculateZoneRectangles } from '../core/geometry.js';
import type { LayoutProfile, MonitorBinding, Rectangle } from '../core/types.js';
import { hintMatches, type WindowAssignment, type WindowCandidate } from '../runtime/windows.js';

const shellGlobal = global as any;

type OverlayOptions = {
  profile: LayoutProfile;
  bindings: MonitorBinding[];
  candidates: WindowCandidate[];
  workAreas: Map<number, Rectangle>;
  missingRoles: string[];
  onApply: (assignments: WindowAssignment[]) => void;
  onCancel: () => void;
};

export class ProfileChooserOverlay {
  #root: any;

  constructor(
    profiles: LayoutProfile[],
    onSelect: (profile: LayoutProfile) => void,
    onCancel: () => void,
  ) {
    this.#root = new St.Widget({
      style_class: 'zonecraft-overlay',
      reactive: true,
      can_focus: true,
      x: 0,
      y: 0,
      width: shellGlobal.stage.width,
      height: shellGlobal.stage.height,
    });
    this.#root.set_layout_manager(new Clutter.BinLayout());
    const card = new St.BoxLayout({
      style_class: 'zonecraft-chooser',
      vertical: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });
    card.add_child(
      new St.Label({ style_class: 'zonecraft-title', text: 'Choose a layout profile' }),
    );
    for (const profile of profiles) {
      const button = new St.Button({
        style_class: 'zonecraft-window',
        label: profile.name,
        can_focus: true,
      });
      button.connect('clicked', () => onSelect(profile));
      card.add_child(button);
    }
    const cancel = new St.Button({ style_class: 'button', label: 'Cancel', can_focus: true });
    cancel.connect('clicked', onCancel);
    card.add_child(cancel);
    this.#root.add_child(card);
    this.#root.connect('key-press-event', (_actor: any, event: any) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        onCancel();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    Main.uiGroup.add_child(this.#root);
    shellGlobal.stage.set_key_focus(this.#root);
  }

  destroy(): void {
    this.#root.destroy();
  }
}

export class AssignmentOverlay {
  #root: any;
  #zoneLayer: any;
  #tray: any;
  #selectedCandidate: WindowCandidate | null = null;
  #assignments = new Map<string, WindowAssignment>();
  #zoneButtons = new Map<string, any>();
  #candidateButtons = new Map<any, any>();
  #applyButton: any;
  #options: OverlayOptions;

  constructor(options: OverlayOptions) {
    this.#options = options;
    this.#root = new St.Widget({
      style_class: 'zonecraft-overlay',
      reactive: true,
      can_focus: true,
      x: 0,
      y: 0,
      width: shellGlobal.stage.width,
      height: shellGlobal.stage.height,
    });
    this.#root.set_layout_manager(new Clutter.BinLayout());
    this.#zoneLayer = new St.Widget({ x_expand: true, y_expand: true });
    this.#zoneLayer.set_layout_manager(new Clutter.FixedLayout());
    this.#root.add_child(this.#zoneLayer);
    this.#root.connect('key-press-event', (_actor: any, event: any) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        this.#options.onCancel();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    this.#buildZones();
    this.#buildTray();
    Main.uiGroup.add_child(this.#root);
    shellGlobal.stage.set_key_focus(this.#root);
  }

  destroy(): void {
    this.#root.destroy();
    this.#zoneButtons.clear();
    this.#candidateButtons.clear();
    this.#assignments.clear();
  }

  #buildZones(): void {
    for (const binding of this.#options.bindings) {
      const area = this.#options.workAreas.get(binding.monitor.index);
      if (!area) continue;
      const rectangles = calculateZoneRectangles(binding.layout, area);
      for (const zone of binding.layout.zones) {
        const rectangle = rectangles.get(zone.id);
        if (!rectangle) continue;
        const button = new St.Button({
          style_class: 'zonecraft-zone',
          label: zone.name,
          reactive: true,
          can_focus: true,
          x: rectangle.x,
          y: rectangle.y,
          width: rectangle.width,
          height: rectangle.height,
        });
        button.connect('clicked', () => this.#assignToZone(binding, zone));
        this.#zoneLayer.add_child(button);
        this.#zoneButtons.set(zone.id, button);
      }
    }
  }

  #buildTray(): void {
    this.#tray = new St.BoxLayout({
      style_class: 'zonecraft-tray',
      vertical: true,
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.#tray.add_child(
      new St.Label({ style_class: 'zonecraft-title', text: this.#options.profile.name }),
    );
    this.#tray.add_child(
      new St.Label({ style_class: 'zonecraft-help', text: 'Choose a window, then choose a zone.' }),
    );
    if (this.#options.missingRoles.length > 0)
      this.#tray.add_child(
        new St.Label({
          style_class: 'zonecraft-warning',
          text: `Unavailable: ${this.#options.missingRoles.join(', ')}`,
        }),
      );
    const scroll = new St.ScrollView({
      style_class: 'zonecraft-window-scroll',
      overlay_scrollbars: true,
    });
    const list = new St.BoxLayout({ vertical: true });
    for (const candidate of this.#sortedCandidates()) {
      const suggested = this.#options.bindings.some(({ layout }) =>
        layout.zones.some((zone) => hintMatches(candidate, zone)),
      );
      const button = new St.Button({
        style_class: suggested ? 'zonecraft-window zonecraft-window-suggested' : 'zonecraft-window',
        label: `${candidate.label}${suggested ? '  • Suggested' : ''}`,
        x_expand: true,
        can_focus: true,
      });
      button.connect('clicked', () => this.#selectCandidate(candidate));
      list.add_child(button);
      this.#candidateButtons.set(candidate.window, button);
    }
    if (this.#options.candidates.length === 0)
      list.add_child(
        new St.Label({
          style_class: 'zonecraft-empty',
          text: 'No eligible windows in this workspace.',
        }),
      );
    scroll.set_child(list);
    this.#tray.add_child(scroll);
    const actions = new St.BoxLayout({ style_class: 'zonecraft-actions' });
    const cancel = new St.Button({ style_class: 'button', label: 'Cancel', can_focus: true });
    cancel.connect('clicked', () => this.#options.onCancel());
    this.#applyButton = new St.Button({
      style_class: 'button suggested-action',
      label: 'Apply',
      can_focus: true,
      reactive: false,
      opacity: 120,
    });
    this.#applyButton.connect('clicked', () =>
      this.#options.onApply([...this.#assignments.values()]),
    );
    actions.add_child(cancel);
    actions.add_child(this.#applyButton);
    this.#tray.add_child(actions);
    this.#root.add_child(this.#tray);
  }

  #sortedCandidates(): WindowCandidate[] {
    return [...this.#options.candidates].sort((a, b) => {
      const aSuggested = this.#options.bindings.some(({ layout }) =>
        layout.zones.some((zone) => hintMatches(a, zone)),
      );
      const bSuggested = this.#options.bindings.some(({ layout }) =>
        layout.zones.some((zone) => hintMatches(b, zone)),
      );
      return Number(bSuggested) - Number(aSuggested) || a.label.localeCompare(b.label);
    });
  }

  #selectCandidate(candidate: WindowCandidate): void {
    this.#selectedCandidate = candidate;
    for (const [window, button] of this.#candidateButtons) {
      if (window === candidate.window) button.add_style_pseudo_class('selected');
      else button.remove_style_pseudo_class('selected');
    }
  }

  #assignToZone(binding: MonitorBinding, zone: any): void {
    if (!this.#selectedCandidate) return;
    for (const [zoneId, assignment] of this.#assignments)
      if (assignment.candidate.window === this.#selectedCandidate.window) {
        this.#assignments.delete(zoneId);
        this.#refreshZone(zoneId);
      }
    this.#assignments.set(zone.id, { binding, zone, candidate: this.#selectedCandidate });
    this.#refreshZone(zone.id);
    this.#selectedCandidate = null;
    for (const button of this.#candidateButtons.values())
      button.remove_style_pseudo_class('selected');
    this.#applyButton.reactive = true;
    this.#applyButton.opacity = 255;
  }

  #refreshZone(zoneId: string): void {
    const button = this.#zoneButtons.get(zoneId);
    if (!button) return;
    const assignment = this.#assignments.get(zoneId);
    button.label = assignment
      ? `${assignment.zone.name}\n${assignment.candidate.label}`
      : button.label.split('\n')[0];
    if (assignment) button.add_style_pseudo_class('assigned');
    else button.remove_style_pseudo_class('assigned');
  }
}
