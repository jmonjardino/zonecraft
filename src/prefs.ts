// SPDX-License-Identifier: GPL-3.0-or-later
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { calculateZoneRectangles, layoutDividers, type Divider } from './core/geometry.js';
import {
  clampRatio,
  layoutZones,
  nodeAt,
  removeZone,
  setSplitRatio,
  splitZone,
} from './core/layout.js';
import {
  createDefaultProfile,
  emptyData,
  nextUniqueName,
  parseData,
  serializeData,
} from './core/profiles.js';
import {
  WEIGHT_TOTAL,
  type Direction,
  type LayoutProfile,
  type MonitorLayout,
  type Rectangle,
  type SplitAxis,
  type ZonecraftData,
} from './core/types.js';

const PREVIEW_PADDING = 4;
const PREVIEW_GAP = 8;
const DIVIDER_GRAB_DISTANCE = 6;

/** Shared state of the preferences window. Widgets are rebuilt from it after structural edits. */
type EditorContext = {
  window: any;
  settings: any;
  data: () => ZonecraftData;
  /** Applies an edit to the live data and saves it; the page is rebuilt on idle unless told not to. */
  commit: (mutation: (data: ZonecraftData) => void, rerender?: boolean) => void;
  expanded: Set<string>;
  selectedZones: Map<string, string>;
};

const GridPreview = GObject.registerClass(
  class GridPreview extends Gtk.DrawingArea {
    layout: () => MonitorLayout | undefined;
    selectedZone: () => string | undefined;
    onSelect: (zoneId: string) => void;
    onResized: () => void;
    drag: { divider: Divider; startX: number; startY: number } | null = null;
    pressX = 0;
    pressY = 0;

    constructor(options: {
      layout: () => MonitorLayout | undefined;
      selectedZone: () => string | undefined;
      onSelect: (zoneId: string) => void;
      onResized: () => void;
    }) {
      super({
        hexpand: true,
        height_request: 260,
        focusable: true,
        margin_top: 12,
        margin_bottom: 6,
      });
      this.layout = options.layout;
      this.selectedZone = options.selectedZone;
      this.onSelect = options.onSelect;
      this.onResized = options.onResized;
      this.set_draw_func((_widget: any, context: any, width: number, height: number) =>
        this.draw(context, width, height),
      );
      const drag = new Gtk.GestureDrag();
      drag.connect('drag-begin', (_gesture: any, x: number, y: number) => this.beginDrag(x, y));
      drag.connect('drag-update', (_gesture: any, dx: number, dy: number) =>
        this.updateDrag(dx, dy),
      );
      drag.connect('drag-end', (_gesture: any, dx: number, dy: number) => this.endDrag(dx, dy));
      this.add_controller(drag);
      const motion = new Gtk.EventControllerMotion();
      motion.connect('motion', (_controller: any, x: number, y: number) => {
        if (this.drag) return;
        const divider = this.dividerAt(x, y);
        this.set_cursor_from_name(divider ? resizeCursor(divider.axis) : null);
      });
      this.add_controller(motion);
    }

    area(): Rectangle {
      return {
        x: PREVIEW_PADDING,
        y: PREVIEW_PADDING,
        width: this.get_width() - PREVIEW_PADDING * 2,
        height: this.get_height() - PREVIEW_PADDING * 2,
      };
    }

    draw(context: any, width: number, height: number): void {
      context.setSourceRGB(0.12, 0.13, 0.15);
      context.paint();
      const layout = this.layout();
      if (!layout || width <= PREVIEW_PADDING * 2 || height <= PREVIEW_PADDING * 2) return;
      const selected = this.selectedZone();
      for (const [zone, rectangle] of previewZones(layout, this.area())) {
        const isSelected = zone.id === selected;
        context.setSourceRGBA(
          isSelected ? 0.18 : 0.12,
          isSelected ? 0.55 : 0.35,
          isSelected ? 0.92 : 0.72,
          isSelected ? 0.72 : 0.46,
        );
        context.rectangle(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
        context.fillPreserve();
        context.setSourceRGBA(0.55, 0.78, 1, 1);
        context.setLineWidth(isSelected ? 3 : 1.5);
        context.stroke();
        context.save();
        context.rectangle(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
        context.clip();
        context.setSourceRGB(1, 1, 1);
        context.selectFontFace('Sans', 0, 0);
        context.setFontSize(13);
        context.moveTo(rectangle.x + 8, rectangle.y + 20);
        context.showText(zone.name);
        context.restore();
      }
    }

    dividerAt(x: number, y: number): Divider | null {
      const layout = this.layout();
      if (!layout) return null;
      let best: { divider: Divider; distance: number } | null = null;
      for (const divider of layoutDividers(layout.root, this.area(), PREVIEW_GAP, 'lenient')) {
        const { line } = divider;
        const along = divider.axis === 'horizontal' ? y : x;
        const start = divider.axis === 'horizontal' ? line.y : line.x;
        const length = divider.axis === 'horizontal' ? line.height : line.width;
        if (along < start || along > start + length) continue;
        const center =
          divider.axis === 'horizontal' ? line.x + line.width / 2 : line.y + line.height / 2;
        const distance = Math.abs((divider.axis === 'horizontal' ? x : y) - center);
        if (distance > PREVIEW_GAP / 2 + DIVIDER_GRAB_DISTANCE) continue;
        if (!best || distance < best.distance) best = { divider, distance };
      }
      return best?.divider ?? null;
    }

    beginDrag(x: number, y: number): void {
      this.pressX = x;
      this.pressY = y;
      const divider = this.dividerAt(x, y);
      this.drag = divider ? { divider, startX: x, startY: y } : null;
      this.grab_focus();
    }

    updateDrag(dx: number, dy: number): void {
      const layout = this.layout();
      if (!this.drag || !layout) return;
      const { divider, startX, startY } = this.drag;
      const horizontal = divider.axis === 'horizontal';
      const pointer = horizontal ? startX + dx : startY + dy;
      const origin = horizontal ? divider.area.x : divider.area.y;
      const size = (horizontal ? divider.area.width : divider.area.height) - PREVIEW_GAP;
      if (size <= 0) return;
      setSplitRatio(
        layout,
        divider.path,
        ((pointer - origin - PREVIEW_GAP / 2) * WEIGHT_TOTAL) / size,
      );
      this.queue_draw();
    }

    endDrag(dx: number, dy: number): void {
      const resized = this.drag !== null;
      this.drag = null;
      if (resized) {
        this.onResized();
        return;
      }
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) return;
      const layout = this.layout();
      if (!layout) return;
      for (const [zone, rectangle] of previewZones(layout, this.area()))
        if (contains(rectangle, this.pressX, this.pressY)) {
          this.onSelect(zone.id);
          this.queue_draw();
          return;
        }
    }
  },
);

export default class ZonecraftPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window: any): void {
    window.set_default_size(900, 720);
    const settings = this.getSettings();
    let data: ZonecraftData;
    try {
      data = parseData(settings.get_string('profiles-json'));
    } catch (error) {
      this.showRepairPage(window, settings, error instanceof Error ? error.message : String(error));
      return;
    }
    // One page for the lifetime of the window. Swapping pages while AdwViewStack
    // animates the transition crashed GJS once the old page had been removed.
    const page = new Adw.PreferencesPage({ title: _('Profiles'), icon_name: 'view-grid-symbolic' });
    window.add(page);
    let groups: any[] = [];
    let renderSource = 0;
    const render = (): void => {
      for (const group of groups) page.remove(group);
      groups = this.buildGroups(context);
      for (const group of groups) page.add(group);
    };
    const context: EditorContext = {
      window,
      settings,
      data: () => data,
      commit: (mutation, rerender = true) => {
        const snapshot = JSON.stringify(data);
        try {
          mutation(data);
          settings.set_string('profiles-json', serializeData(data));
        } catch (error) {
          data = JSON.parse(snapshot) as ZonecraftData;
          rerender = true;
          window.add_toast(
            new Adw.Toast({ title: error instanceof Error ? error.message : String(error) }),
          );
        }
        // Rebuild on idle: the widget that emitted this signal must outlive its handler.
        if (rerender && !renderSource)
          renderSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            renderSource = 0;
            render();
            return GLib.SOURCE_REMOVE;
          });
      },
      expanded: new Set<string>(),
      selectedZones: new Map<string, string>(),
    };
    window.connect('close-request', () => {
      if (renderSource) GLib.source_remove(renderSource);
      renderSource = 0;
      return false;
    });
    render();
  }

  buildGroups(context: EditorContext): any[] {
    const { settings, window } = context;
    const profilesGroup = new Adw.PreferencesGroup({
      title: _('Layout profiles'),
      description: _('Create layouts for the primary monitor and monitors around it.'),
    });
    for (const profile of context.data().profiles)
      profilesGroup.add(this.buildProfileRow(context, profile));
    const addProfile = new Adw.ButtonRow({
      title: _('Create profile'),
      start_icon_name: 'list-add-symbolic',
    });
    addProfile.connect('activated', () =>
      context.commit((data) => {
        const profile = createDefaultProfile(
          randomId(),
          nextUniqueName(data.profiles, 'My layout'),
        );
        data.profiles.push(profile);
        context.expanded.add(profile.id);
      }),
    );
    profilesGroup.add(addProfile);

    const behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
    behavior.add(this.shortcutRow(window, settings));
    const showIndicator = new Adw.SwitchRow({
      title: _('Show panel indicator'),
      active: settings.get_boolean('show-panel-indicator'),
    });
    showIndicator.connect('notify::active', () =>
      settings.set_boolean('show-panel-indicator', showIndicator.active),
    );
    behavior.add(showIndicator);
    return [profilesGroup, behavior];
  }

  buildProfileRow(context: EditorContext, profile: LayoutProfile): any {
    const profileId = profile.id;
    const findProfile = (data: ZonecraftData): LayoutProfile =>
      data.profiles.find((candidate) => candidate.id === profileId)!;
    const row = new Adw.ExpanderRow({
      title: profile.name,
      subtitle: _(`${profile.monitors.length} monitor layout(s)`),
      expanded: context.expanded.has(profileId),
    });
    row.connect('notify::expanded', () => {
      if (row.expanded) context.expanded.add(profileId);
      else context.expanded.delete(profileId);
    });
    const apply = new Gtk.Button({
      icon_name: 'media-playback-start-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Apply profile'),
    });
    apply.connect('clicked', () =>
      // GNOME Shell listens for this key and opens the assignment overlay.
      context.settings.set_string('activate-profile', `${profileId}:${GLib.get_monotonic_time()}`),
    );
    row.add_suffix(apply);
    const duplicate = new Gtk.Button({
      icon_name: 'edit-copy-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Duplicate profile'),
    });
    duplicate.connect('clicked', () =>
      context.commit((data) => {
        const copy = cloneData(findProfile(data));
        copy.id = randomId();
        copy.name = nextUniqueName(data.profiles, `${copy.name} copy`);
        for (const monitor of copy.monitors)
          for (const zone of layoutZones(monitor)) zone.id = randomId();
        data.profiles.push(copy);
      }),
    );
    row.add_suffix(duplicate);
    const remove = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Delete profile'),
    });
    remove.add_css_class('destructive-action');
    remove.connect('clicked', () =>
      this.confirmDelete(context.window, profile.name, () =>
        context.commit((data) => {
          data.profiles = data.profiles.filter((item) => item.id !== profileId);
        }),
      ),
    );
    row.add_suffix(remove);

    const name = new Adw.EntryRow({ title: _('Profile name'), text: profile.name });
    name.connect('apply', () => {
      const value = name.text.trim();
      const taken = context
        .data()
        .profiles.some(
          (candidate) =>
            candidate.id !== profileId &&
            candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
        );
      if (!value || taken) {
        context.window.add_toast(
          new Adw.Toast({ title: _('Profile names must be non-empty and unique') }),
        );
        return;
      }
      context.commit((data) => (findProfile(data).name = value));
    });
    row.add_row(name);
    for (let monitorIndex = 0; monitorIndex < profile.monitors.length; monitorIndex++)
      this.addMonitorEditor(context, row, profileId, monitorIndex);

    const addMonitorRow = new Adw.ActionRow({ title: _('Add monitor layout') });
    for (const direction of ['left', 'right', 'above', 'below'] as const) {
      const button = new Gtk.Button({ label: _(capitalize(direction)), valign: Gtk.Align.CENTER });
      button.connect('clicked', () =>
        context.commit((data) => {
          const target = findProfile(data);
          const rank =
            1 +
            target.monitors.filter(
              (monitor) => monitor.role.kind === 'relative' && monitor.role.direction === direction,
            ).length;
          const layout = createDefaultProfile(randomId()).monitors[0]!;
          layout.role = { kind: 'relative', direction, rank };
          for (const zone of layoutZones(layout)) zone.id = randomId();
          target.monitors.push(layout);
        }),
      );
      addMonitorRow.add_suffix(button);
    }
    row.add_row(addMonitorRow);
    return row;
  }

  addMonitorEditor(
    context: EditorContext,
    container: any,
    profileId: string,
    monitorIndex: number,
  ): void {
    const findLayout = (data: ZonecraftData): MonitorLayout | undefined =>
      data.profiles.find((candidate) => candidate.id === profileId)?.monitors[monitorIndex];
    const edit = (mutation: (layout: MonitorLayout) => void, rerender = true): void =>
      context.commit((data) => mutation(findLayout(data)!), rerender);
    const layout = findLayout(context.data())!;
    const selectionKey = `${profileId}/${monitorIndex}`;
    const selectedZone = (): string | undefined => {
      const current = findLayout(context.data());
      if (!current) return undefined;
      const zones = layoutZones(current);
      const selected = context.selectedZones.get(selectionKey);
      return zones.some((zone) => zone.id === selected) ? selected : zones[0]?.id;
    };

    const zones = layoutZones(layout);
    const title =
      layout.role.kind === 'primary'
        ? _('Primary monitor')
        : _(`${capitalize(layout.role.direction)} monitor ${layout.role.rank}`);
    const header = new Adw.ActionRow({ title, subtitle: _(`${zones.length} zone(s)`) });
    if (layout.role.kind !== 'primary') {
      const remove = new Gtk.Button({
        icon_name: 'list-remove-symbolic',
        tooltip_text: _('Remove monitor layout'),
        valign: Gtk.Align.CENTER,
      });
      remove.connect('clicked', () =>
        context.commit((data) =>
          data.profiles
            .find((candidate) => candidate.id === profileId)!
            .monitors.splice(monitorIndex, 1),
        ),
      );
      header.add_suffix(remove);
    }
    container.add_row(header);

    const editor = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_start: 12,
      margin_end: 12,
      margin_bottom: 12,
    });
    const preview = new GridPreview({
      layout: () => findLayout(context.data()),
      selectedZone,
      onSelect: (zoneId: string) => context.selectedZones.set(selectionKey, zoneId),
      // The preview already shows the new size, so only persist it.
      onResized: () => edit(() => undefined, false),
    });
    editor.append(preview);
    const hint = new Gtk.Label({
      label: _(
        'Click a zone to select it, then split or remove it. Drag the gap between zones to resize.',
      ),
      wrap: true,
      xalign: 0,
    });
    hint.add_css_class('dim-label');
    hint.add_css_class('caption');
    editor.append(hint);
    const actions = new Adw.WrapBox({ child_spacing: 6, line_spacing: 6 });
    const splitAction = (label: string, axis: SplitAxis): any => {
      const button = new Gtk.Button({ label });
      button.connect('clicked', () => {
        const zoneId = selectedZone();
        if (!zoneId) return;
        edit((target) => {
          const created = splitZone(target, zoneId, axis, randomId());
          context.selectedZones.set(selectionKey, created.id);
        });
      });
      return button;
    };
    actions.append(splitAction(_('Split side by side'), 'horizontal'));
    actions.append(splitAction(_('Split top and bottom'), 'vertical'));
    const removeButton = new Gtk.Button({ label: _('Remove zone') });
    removeButton.add_css_class('destructive-action');
    removeButton.set_sensitive(zones.length > 1);
    removeButton.connect('clicked', () => {
      const zoneId = selectedZone();
      if (zoneId) edit((target) => removeZone(target, zoneId));
    });
    actions.append(removeButton);
    const equalize = new Gtk.Button({ label: _('Reset sizes') });
    equalize.set_sensitive(layout.root.kind === 'split');
    equalize.connect('clicked', () => edit((target) => resetRatios(target)));
    actions.append(equalize);
    editor.append(actions);
    container.add_row(new Gtk.ListBoxRow({ selectable: false, activatable: false, child: editor }));

    for (const zone of zones) {
      const zoneName = new Adw.EntryRow({ title: _('Zone name'), text: zone.name });
      zoneName.connect('apply', () => {
        const value = zoneName.text.trim();
        const current = findLayout(context.data());
        const duplicate =
          !current ||
          layoutZones(current).some(
            (candidate) =>
              candidate.id !== zone.id &&
              candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
          );
        if (!value || duplicate) {
          context.window.add_toast(
            new Adw.Toast({ title: _('Zone names must be non-empty and unique') }),
          );
          return;
        }
        edit((target) => {
          layoutZones(target).find((candidate) => candidate.id === zone.id)!.name = value;
        }, false);
        preview.queue_draw();
      });
      container.add_row(zoneName);
    }

    container.add_row(
      this.gapRow(_('Outer margin'), layout.outerGap, (value) =>
        edit((target) => (target.outerGap = value), false),
      ),
    );
    container.add_row(
      this.gapRow(_('Space between zones'), layout.innerGap, (value) =>
        edit((target) => (target.innerGap = value), false),
      ),
    );
  }

  shortcutRow(window: any, settings: any): any {
    const row = new Adw.ActionRow({
      title: _('Open selector'),
      subtitle: _('Shortcut that starts a profile from anywhere'),
      activatable: true,
    });
    const label = new Gtk.ShortcutLabel({
      accelerator: settings.get_strv('open-selector')[0] ?? '',
      disabled_text: _('Disabled'),
      valign: Gtk.Align.CENTER,
    });
    row.add_suffix(label);
    const reset = new Gtk.Button({
      icon_name: 'edit-undo-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Restore the default shortcut'),
    });
    reset.add_css_class('flat');
    const refresh = (): void => {
      label.accelerator = settings.get_strv('open-selector')[0] ?? '';
      reset.visible = settings.get_user_value('open-selector') !== null;
    };
    reset.connect('clicked', () => {
      settings.reset('open-selector');
      refresh();
    });
    row.add_suffix(reset);
    row.connect('activated', () =>
      this.recordShortcut(window, (accelerator) => {
        settings.set_strv('open-selector', accelerator ? [accelerator] : []);
        refresh();
      }),
    );
    refresh();
    return row;
  }

  /** Captures the next key combination. Esc cancels; Backspace disables the shortcut. */
  recordShortcut(window: any, done: (accelerator: string | null) => void): void {
    const content = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 24,
      margin_bottom: 24,
      margin_start: 24,
      margin_end: 24,
    });
    content.append(new Gtk.Label({ label: _('Press the new shortcut'), css_classes: ['title-2'] }));
    const hint = new Gtk.Label({
      label: _('Esc to cancel, Backspace to disable the shortcut.'),
      wrap: true,
      css_classes: ['dim-label'],
    });
    content.append(hint);
    const toolbar = new Adw.ToolbarView({ content });
    toolbar.add_top_bar(new Adw.HeaderBar({ show_title: false }));
    const dialog = new Adw.Dialog({ title: _('Set shortcut'), content_width: 360, child: toolbar });
    const keys = new Gtk.EventControllerKey();
    keys.connect(
      'key-pressed',
      (_controller: any, keyval: number, keycode: number, state: number): boolean => {
        const mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if (mask === 0 && keyval === Gdk.KEY_Escape) {
          dialog.close();
          return Gdk.EVENT_STOP;
        }
        if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
          done(null);
          dialog.close();
          return Gdk.EVENT_STOP;
        }
        const key = Gdk.keyval_to_lower(keyval);
        // Modifier presses on their own are not valid accelerators yet: keep waiting.
        if (!Gtk.accelerator_valid(key, mask)) return Gdk.EVENT_STOP;
        const functionKey = key >= Gdk.KEY_F1 && key <= Gdk.KEY_F35;
        if (mask === 0 && !functionKey) {
          hint.label = _('Use at least one modifier such as Super, Ctrl or Alt.');
          return Gdk.EVENT_STOP;
        }
        done(Gtk.accelerator_name_with_keycode(null, key, keycode, mask));
        dialog.close();
        return Gdk.EVENT_STOP;
      },
    );
    dialog.add_controller(keys);
    // Without this, GNOME Shell consumes combinations such as Super+Shift+Z itself.
    const surface = (): any => window.get_native()?.get_surface();
    dialog.connect('map', () => surface()?.inhibit_system_shortcuts?.(null));
    dialog.connect('closed', () => surface()?.restore_system_shortcuts?.());
    dialog.present(window);
  }

  gapRow(title: string, value: number, changed: (value: number) => void): any {
    const row = new Adw.SpinRow({
      title,
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 128,
        step_increment: 1,
        page_increment: 8,
        value,
      }),
    });
    row.connect('notify::value', () => changed(Math.round(row.value)));
    return row;
  }

  confirmDelete(window: any, name: string, confirmed: () => void): void {
    const dialog = new Adw.AlertDialog({
      heading: _('Delete profile?'),
      body: _(`“${name}” cannot be recovered.`),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('delete', _('Delete'));
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.set_default_response('cancel');
    dialog.set_close_response('cancel');
    dialog.choose(window, null, (_dialog: any, result: any) => {
      if (dialog.choose_finish(result) === 'delete') confirmed();
    });
  }

  showRepairPage(window: any, settings: any, message: string): void {
    const page = new Adw.PreferencesPage({
      title: _('Repair settings'),
      icon_name: 'dialog-warning-symbolic',
    });
    const group = new Adw.PreferencesGroup({
      title: _('Profiles could not be loaded'),
      description: message,
    });
    const reset = new Adw.ButtonRow({
      title: _('Reset profile data'),
      start_icon_name: 'edit-delete-symbolic',
    });
    reset.add_css_class('destructive-action');
    reset.connect('activated', () => {
      settings.set_string('profiles-json', serializeData(emptyData()));
      window.close();
    });
    group.add(reset);
    page.add(group);
    window.add(page);
  }
}

function previewZones(
  layout: MonitorLayout,
  area: Rectangle,
): Array<[{ id: string; name: string }, Rectangle]> {
  const rectangles = calculateZoneRectangles(
    { ...layout, outerGap: 0, innerGap: PREVIEW_GAP },
    area,
    'lenient',
  );
  return layoutZones(layout).flatMap((zone) => {
    const rectangle = rectangles.get(zone.id);
    return rectangle ? [[zone, rectangle] as [typeof zone, Rectangle]] : [];
  });
}

function resetRatios(layout: MonitorLayout, path = ''): void {
  const node = nodeAt(layout.root, path);
  if (node?.kind !== 'split') return;
  node.ratio = clampRatio(WEIGHT_TOTAL / 2);
  resetRatios(layout, `${path}0`);
  resetRatios(layout, `${path}1`);
}

function contains(rectangle: Rectangle, x: number, y: number): boolean {
  return (
    x >= rectangle.x &&
    x < rectangle.x + rectangle.width &&
    y >= rectangle.y &&
    y < rectangle.y + rectangle.height
  );
}

function resizeCursor(axis: SplitAxis): string {
  return axis === 'horizontal' ? 'col-resize' : 'row-resize';
}

function randomId(): string {
  return GLib.uuid_string_random();
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function capitalize(value: Direction): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
