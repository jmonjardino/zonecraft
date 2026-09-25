// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { calculateZoneRectangles } from '../core/geometry.js';
import { layoutZones } from '../core/layout.js';
import type { LayoutProfile, MonitorBinding, Rectangle, Zone } from '../core/types.js';
import { hintMatches, type WindowAssignment, type WindowCandidate } from '../runtime/windows.js';

const shellGlobal = global as any;

export const GRAB_FAILURE_MESSAGE =
  'Zonecraft could not take over the screen. Close other menus or dialogs and try again.';

type OverlayOptions = {
  profile: LayoutProfile;
  bindings: MonitorBinding[];
  candidates: WindowCandidate[];
  workAreas: Map<number, Rectangle>;
  missingRoles: string[];
  onApply: (assignments: WindowAssignment[]) => void;
  onCancel: () => void;
};

function stageRectangle(): Rectangle {
  return { x: 0, y: 0, width: shellGlobal.stage.width, height: shellGlobal.stage.height };
}

function primaryMonitorRectangle(): Rectangle {
  const monitor = Main.layoutManager.primaryMonitor;
  if (!monitor) return stageRectangle();
  return { x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height };
}

function primaryWorkArea(): Rectangle {
  const monitor = Main.layoutManager.primaryMonitor;
  if (!monitor) return stageRectangle();
  const area = shellGlobal.workspace_manager
    .get_active_workspace()
    .get_work_area_for_monitor(monitor.index);
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

function createOverlayRoot(): any {
  const root = new St.Widget({
    style_class: 'zonecraft-overlay',
    reactive: true,
    can_focus: true,
    ...stageRectangle(),
  });
  root.set_layout_manager(new Clutter.FixedLayout());
  return root;
}

function createMonitorAnchor(area: Rectangle): any {
  const anchor = new St.Widget({ ...area });
  anchor.set_layout_manager(new Clutter.BinLayout());
  return anchor;
}

function pushOverlayModal(root: any): any {
  const grab = Main.pushModal(root, { actionMode: Shell.ActionMode.SYSTEM_MODAL });
  if (grab.get_seat_state() === Clutter.GrabState.NONE) {
    Main.popModal(grab);
    root.destroy();
    throw new Error(GRAB_FAILURE_MESSAGE);
  }
  return grab;
}

export class ProfileChooserOverlay {
  #root: any;
  #grab: any = null;

  constructor(
    profiles: LayoutProfile[],
    onSelect: (profile: LayoutProfile) => void,
    onCancel: () => void,
  ) {
    this.#root = createOverlayRoot();
    const anchor = createMonitorAnchor(primaryMonitorRectangle());
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
    anchor.add_child(card);
    this.#root.add_child(anchor);
    this.#root.connect('key-press-event', (_actor: any, event: any) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        onCancel();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    Main.uiGroup.add_child(this.#root);
    this.#grab = pushOverlayModal(this.#root);
    shellGlobal.stage.set_key_focus(this.#root);
  }

  destroy(): void {
    if (this.#grab) Main.popModal(this.#grab);
    this.#grab = null;
    this.#root?.destroy();
    this.#root = null;
  }
}

export class AssignmentOverlay {
  #root: any;
  #zoneLayer: any;
  #tray: any;
  #grab: any = null;
  #selectedCandidate: WindowCandidate | null = null;
  #assignments = new Map<string, WindowAssignment>();
  #zoneButtons = new Map<string, { button: any; name: string }>();
  #candidateButtons = new Map<any, any>();
  #unmanagedIds = new Map<any, number>();
  #applyButton: any;
  #options: OverlayOptions;

  constructor(options: OverlayOptions) {
    this.#options = options;
    this.#root = createOverlayRoot();
    this.#zoneLayer = new St.Widget({ ...stageRectangle() });
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
    this.#grab = pushOverlayModal(this.#root);
    this.#trackCandidates();
    shellGlobal.stage.set_key_focus(this.#root);
  }

  destroy(): void {
    for (const [window, id] of this.#unmanagedIds) window.disconnect(id);
    this.#unmanagedIds.clear();
    if (this.#grab) Main.popModal(this.#grab);
    this.#grab = null;
    this.#root?.destroy();
    this.#root = null;
    this.#zoneButtons.clear();
    this.#candidateButtons.clear();
    this.#assignments.clear();
  }

  #buildZones(): void {
    for (const binding of this.#options.bindings) {
      const area = this.#options.workAreas.get(binding.monitor.index);
      if (!area) continue;
      let rectangles: Map<string, Rectangle>;
      try {
        rectangles = calculateZoneRectangles(binding.layout, area);
      } catch (error) {
        // Too many nested zones for this monitor's size; the other monitors stay usable.
        console.warn(`Zonecraft: skipping monitor ${binding.monitor.index}: ${String(error)}`);
        continue;
      }
      for (const zone of layoutZones(binding.layout)) {
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
        this.#zoneButtons.set(zone.id, { button, name: zone.name });
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
      new St.Label({
        style_class: 'zonecraft-help',
        text: 'Choose a window, then choose a zone. Choose an assigned zone to clear it.',
      }),
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
        layoutZones(layout).some((zone) => hintMatches(candidate, zone)),
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
    });
    this.#applyButton.connect('clicked', () =>
      this.#options.onApply([...this.#assignments.values()]),
    );
    actions.add_child(cancel);
    actions.add_child(this.#applyButton);
    this.#tray.add_child(actions);
    this.#syncApplyButton();
    const anchor = createMonitorAnchor(primaryWorkArea());
    anchor.add_child(this.#tray);
    this.#root.add_child(anchor);
  }

  #trackCandidates(): void {
    for (const candidate of this.#options.candidates)
      this.#unmanagedIds.set(
        candidate.window,
        candidate.window.connect('unmanaged', () => this.#forgetWindow(candidate.window)),
      );
  }

  #forgetWindow(window: any): void {
    const id = this.#unmanagedIds.get(window);
    if (id) window.disconnect(id);
    this.#unmanagedIds.delete(window);
    const button = this.#candidateButtons.get(window);
    if (button) button.destroy();
    this.#candidateButtons.delete(window);
    if (this.#selectedCandidate?.window === window) this.#selectedCandidate = null;
    for (const [zoneId, assignment] of [...this.#assignments])
      if (assignment.candidate.window === window) {
        this.#assignments.delete(zoneId);
        this.#refreshZone(zoneId);
      }
    this.#syncApplyButton();
  }

  #sortedCandidates(): WindowCandidate[] {
    return [...this.#options.candidates].sort((a, b) => {
      const aSuggested = this.#options.bindings.some(({ layout }) =>
        layoutZones(layout).some((zone) => hintMatches(a, zone)),
      );
      const bSuggested = this.#options.bindings.some(({ layout }) =>
        layoutZones(layout).some((zone) => hintMatches(b, zone)),
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

  #assignToZone(binding: MonitorBinding, zone: Zone): void {
    if (!this.#selectedCandidate) {
      if (!this.#assignments.delete(zone.id)) return;
      this.#refreshZone(zone.id);
      this.#syncApplyButton();
      return;
    }
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
    this.#syncApplyButton();
  }

  #syncApplyButton(): void {
    const enabled = this.#assignments.size > 0;
    this.#applyButton.reactive = enabled;
    this.#applyButton.opacity = enabled ? 255 : 120;
  }

  #refreshZone(zoneId: string): void {
    const entry = this.#zoneButtons.get(zoneId);
    if (!entry) return;
    const assignment = this.#assignments.get(zoneId);
    entry.button.label = assignment ? `${entry.name}\n${assignment.candidate.label}` : entry.name;
    if (assignment) entry.button.add_style_pseudo_class('assigned');
    else entry.button.remove_style_pseudo_class('assigned');
  }
}
