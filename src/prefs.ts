// SPDX-License-Identifier: GPL-3.0-or-later
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
  addTrack,
  mergeCells,
  removeLastTrack,
  resizeTracks,
  unmergeZone,
  zoneAt,
  type Axis,
  type Cell,
} from './core/grid.js';
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
  type ZonecraftData,
} from './core/types.js';

const GridPreview = GObject.registerClass(
  class GridPreview extends Gtk.DrawingArea {
    layout: MonitorLayout;
    selected = new Set<string>();
    onChanged: () => void;
    dragAxis: Axis | null = null;
    dragSeparator = -1;
    dragWeights: number[] = [];

    constructor(layout: MonitorLayout, onChanged: () => void) {
      super({
        hexpand: true,
        height_request: 260,
        focusable: true,
        margin_top: 12,
        margin_bottom: 12,
      });
      this.layout = layout;
      this.onChanged = onChanged;
      this.set_draw_func((_widget: any, context: any, width: number, height: number) =>
        this.draw(context, width, height),
      );
      const click = new Gtk.GestureClick();
      click.connect('pressed', (_gesture: any, _count: number, x: number, y: number) =>
        this.toggleCell(x, y),
      );
      this.add_controller(click);
      const drag = new Gtk.GestureDrag();
      drag.connect('drag-begin', (_gesture: any, x: number, y: number) => this.beginDrag(x, y));
      drag.connect('drag-update', (_gesture: any, dx: number, dy: number) =>
        this.updateDrag(dx, dy),
      );
      drag.connect('drag-end', () => {
        if (this.dragAxis) this.onChanged();
        this.dragAxis = null;
      });
      this.add_controller(drag);
    }

    draw(context: any, width: number, height: number): void {
      context.setSourceRGB(0.12, 0.13, 0.15);
      context.paint();
      const columns = pixelBoundaries(this.layout.columnWeights, width);
      const rows = pixelBoundaries(this.layout.rowWeights, height);
      for (const zone of this.layout.zones) {
        const x = columns[zone.column]!;
        const y = rows[zone.row]!;
        const right = columns[zone.column + zone.columnSpan]!;
        const bottom = rows[zone.row + zone.rowSpan]!;
        const selected = [...this.selected].some((key) => {
          const [row, column] = key.split(':').map(Number);
          return (
            row! >= zone.row &&
            row! < zone.row + zone.rowSpan &&
            column! >= zone.column &&
            column! < zone.column + zone.columnSpan
          );
        });
        context.setSourceRGBA(
          selected ? 0.18 : 0.12,
          selected ? 0.55 : 0.35,
          selected ? 0.92 : 0.72,
          selected ? 0.72 : 0.46,
        );
        context.rectangle(x + 4, y + 4, right - x - 8, bottom - y - 8);
        context.fillPreserve();
        context.setSourceRGBA(0.55, 0.78, 1, 1);
        context.setLineWidth(2);
        context.stroke();
        context.setSourceRGB(1, 1, 1);
        context.selectFontFace('Sans', 0, 0);
        context.setFontSize(14);
        context.moveTo(x + 12, y + 25);
        context.showText(zone.name);
      }
    }

    selectedCells(): Cell[] {
      return [...this.selected].map((key) => {
        const [row, column] = key.split(':').map(Number);
        return { row: row!, column: column! };
      });
    }

    clearSelection(): void {
      this.selected.clear();
      this.queue_draw();
    }

    toggleCell(x: number, y: number): void {
      const column = trackAt(this.layout.columnWeights, x, this.get_width());
      const row = trackAt(this.layout.rowWeights, y, this.get_height());
      const key = `${row}:${column}`;
      if (this.selected.has(key)) this.selected.delete(key);
      else this.selected.add(key);
      this.queue_draw();
    }

    beginDrag(x: number, y: number): void {
      const vertical = nearestSeparator(this.layout.columnWeights, x, this.get_width());
      const horizontal = nearestSeparator(this.layout.rowWeights, y, this.get_height());
      if (vertical && (!horizontal || vertical.distance <= horizontal.distance)) {
        this.dragAxis = 'column';
        this.dragSeparator = vertical.index;
        this.dragWeights = [...this.layout.columnWeights];
      } else if (horizontal) {
        this.dragAxis = 'row';
        this.dragSeparator = horizontal.index;
        this.dragWeights = [...this.layout.rowWeights];
      }
    }

    updateDrag(dx: number, dy: number): void {
      if (!this.dragAxis) return;
      if (this.dragAxis === 'column') this.layout.columnWeights = [...this.dragWeights];
      else this.layout.rowWeights = [...this.dragWeights];
      const pixels = this.dragAxis === 'column' ? dx : dy;
      const size = this.dragAxis === 'column' ? this.get_width() : this.get_height();
      try {
        resizeTracks(
          this.layout,
          this.dragAxis,
          this.dragSeparator,
          Math.round((pixels * WEIGHT_TOTAL) / size),
        );
        this.queue_draw();
      } catch {
        // The visible divider simply stops at the minimum track size.
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
    const render = (): void => {
      const oldPage = window.get_visible_page?.();
      const page = this.buildProfilesPage(window, settings, data, (next) => {
        settings.set_string('profiles-json', serializeData(next));
        data = next;
        render();
      });
      window.add(page);
      window.set_visible_page?.(page);
      if (oldPage) window.remove(oldPage);
    };
    render();
  }

  buildProfilesPage(
    window: any,
    settings: any,
    data: ZonecraftData,
    save: (data: ZonecraftData) => void,
  ): any {
    const page = new Adw.PreferencesPage({ title: _('Profiles'), icon_name: 'view-grid-symbolic' });
    const profilesGroup = new Adw.PreferencesGroup({
      title: _('Layout profiles'),
      description: _('Create grids for the primary monitor and monitors around it.'),
    });
    page.add(profilesGroup);
    for (const profile of data.profiles)
      profilesGroup.add(this.buildProfileRow(window, data, profile, save));
    const addProfile = new Adw.ButtonRow({
      title: _('Create profile'),
      start_icon_name: 'list-add-symbolic',
    });
    addProfile.connect('activated', () => {
      const next = cloneData(data);
      next.profiles.push(
        createDefaultProfile(randomId(), nextUniqueName(next.profiles, 'My layout')),
      );
      save(next);
    });
    profilesGroup.add(addProfile);

    const behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
    const shortcut = new Adw.EntryRow({
      title: _('Open selector'),
      text: settings.get_strv('open-selector')[0] ?? '<Super><Shift>z',
    });
    shortcut.connect('apply', () => {
      const accelerator = shortcut.text.trim();
      const [valid] = Gtk.accelerator_parse(accelerator);
      if (valid) settings.set_strv('open-selector', [accelerator]);
      else window.add_toast(new Adw.Toast({ title: _('Invalid keyboard shortcut') }));
    });
    behavior.add(shortcut);
    const showIndicator = new Adw.SwitchRow({
      title: _('Show panel indicator'),
      active: settings.get_boolean('show-panel-indicator'),
    });
    showIndicator.connect('notify::active', () =>
      settings.set_boolean('show-panel-indicator', showIndicator.active),
    );
    behavior.add(showIndicator);
    page.add(behavior);
    return page;
  }

  buildProfileRow(
    window: any,
    data: ZonecraftData,
    profile: LayoutProfile,
    save: (data: ZonecraftData) => void,
  ): any {
    const row = new Adw.ExpanderRow({
      title: profile.name,
      subtitle: _(`${profile.monitors.length} monitor layout(s)`),
    });
    const duplicate = new Gtk.Button({
      icon_name: 'edit-copy-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Duplicate profile'),
    });
    duplicate.connect('clicked', () => {
      const next = cloneData(data);
      const copy = cloneData(profile);
      copy.id = randomId();
      copy.name = nextUniqueName(next.profiles, `${profile.name} copy`);
      for (const monitor of copy.monitors) for (const zone of monitor.zones) zone.id = randomId();
      next.profiles.push(copy);
      save(next);
    });
    row.add_suffix(duplicate);
    const remove = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Delete profile'),
    });
    remove.add_css_class('destructive-action');
    remove.connect('clicked', () =>
      this.confirmDelete(window, profile.name, () =>
        save({ ...data, profiles: data.profiles.filter((item) => item.id !== profile.id) }),
      ),
    );
    row.add_suffix(remove);

    const name = new Adw.EntryRow({ title: _('Profile name'), text: profile.name });
    name.connect('apply', () => {
      const value = name.text.trim();
      if (
        !value ||
        data.profiles.some(
          (candidate) =>
            candidate.id !== profile.id &&
            candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
        )
      )
        return;
      const next = cloneData(data);
      next.profiles.find((candidate) => candidate.id === profile.id)!.name = value;
      save(next);
    });
    row.add_row(name);
    for (let monitorIndex = 0; monitorIndex < profile.monitors.length; monitorIndex++)
      this.addMonitorEditor(window, row, data, profile.id, monitorIndex, save);

    const addMonitorRow = new Adw.ActionRow({ title: _('Add monitor layout') });
    for (const direction of ['left', 'right', 'above', 'below'] as const) {
      const button = new Gtk.Button({ label: _(capitalize(direction)), valign: Gtk.Align.CENTER });
      button.connect('clicked', () => {
        const next = cloneData(data);
        const target = next.profiles.find((candidate) => candidate.id === profile.id)!;
        const rank =
          1 +
          target.monitors.filter(
            (monitor) => monitor.role.kind === 'relative' && monitor.role.direction === direction,
          ).length;
        const layout = createDefaultProfile(randomId()).monitors[0]!;
        layout.role = { kind: 'relative', direction, rank };
        layout.zones.forEach((zone) => (zone.id = randomId()));
        target.monitors.push(layout);
        save(next);
      });
      addMonitorRow.add_suffix(button);
    }
    row.add_row(addMonitorRow);
    return row;
  }

  addMonitorEditor(
    window: any,
    container: any,
    data: ZonecraftData,
    profileId: string,
    monitorIndex: number,
    save: (data: ZonecraftData) => void,
  ): void {
    const profile = data.profiles.find((candidate) => candidate.id === profileId)!;
    const layout = profile.monitors[monitorIndex]!;
    const title =
      layout.role.kind === 'primary'
        ? _('Primary monitor')
        : _(`${capitalize(layout.role.direction)} monitor ${layout.role.rank}`);
    const header = new Adw.ActionRow({
      title,
      subtitle: _(`${layout.rowWeights.length} × ${layout.columnWeights.length} grid`),
    });
    if (layout.role.kind !== 'primary') {
      const remove = new Gtk.Button({
        icon_name: 'list-remove-symbolic',
        tooltip_text: _('Remove monitor layout'),
        valign: Gtk.Align.CENTER,
      });
      remove.connect('clicked', () =>
        this.mutate(data, profileId, save, (nextProfile) =>
          nextProfile.monitors.splice(monitorIndex, 1),
        ),
      );
      header.add_suffix(remove);
    }
    container.add_row(header);

    const preview = new GridPreview(layout, () => save(cloneData(data)));
    const previewRow = new Gtk.ListBoxRow({
      selectable: false,
      activatable: false,
      child: preview,
    });
    container.add_row(previewRow);

    for (const zone of layout.zones) {
      const zoneName = new Adw.EntryRow({ title: _('Zone name'), text: zone.name });
      zoneName.connect('apply', () => {
        const value = zoneName.text.trim();
        const duplicate = layout.zones.some(
          (candidate) =>
            candidate.id !== zone.id &&
            candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
        );
        if (!value || duplicate) {
          window.add_toast(new Adw.Toast({ title: _('Zone names must be non-empty and unique') }));
          return;
        }
        this.mutate(data, profileId, save, (target) => {
          target.monitors[monitorIndex]!.zones.find((candidate) => candidate.id === zone.id)!.name =
            value;
        });
      });
      container.add_row(zoneName);
    }

    const gridActions = new Adw.ActionRow({
      title: _('Grid tracks'),
      subtitle: _('Select cells in the preview to merge them.'),
    });
    const actions: Array<[string, () => void]> = [
      [
        _('+ Row'),
        () =>
          this.mutate(data, profileId, save, (target) =>
            addTrack(target.monitors[monitorIndex]!, 'row', randomId),
          ),
      ],
      [
        _('− Row'),
        () =>
          this.mutate(data, profileId, save, (target) =>
            removeLastTrack(target.monitors[monitorIndex]!, 'row'),
          ),
      ],
      [
        _('+ Column'),
        () =>
          this.mutate(data, profileId, save, (target) =>
            addTrack(target.monitors[monitorIndex]!, 'column', randomId),
          ),
      ],
      [
        _('− Column'),
        () =>
          this.mutate(data, profileId, save, (target) =>
            removeLastTrack(target.monitors[monitorIndex]!, 'column'),
          ),
      ],
      [
        _('Merge'),
        () =>
          this.mutate(data, profileId, save, (target) =>
            mergeCells(
              target.monitors[monitorIndex]!,
              preview.selectedCells(),
              randomId(),
              `Zone ${target.monitors[monitorIndex]!.zones.length + 1}`,
            ),
          ),
      ],
      [
        _('Unmerge'),
        () =>
          this.mutate(data, profileId, save, (target) => {
            const cell = preview.selectedCells()[0];
            if (!cell) throw new Error('Select a merged zone first.');
            const zone = zoneAt(target.monitors[monitorIndex]!, cell);
            if (!zone) throw new Error('Zone not found.');
            unmergeZone(target.monitors[monitorIndex]!, zone.id, randomId);
          }),
      ],
    ];
    for (const [label, callback] of actions) {
      const button = new Gtk.Button({ label, valign: Gtk.Align.CENTER });
      button.connect('clicked', () => {
        try {
          callback();
        } catch (error) {
          window.add_toast(
            new Adw.Toast({ title: error instanceof Error ? error.message : String(error) }),
          );
        }
      });
      gridActions.add_suffix(button);
    }
    container.add_row(gridActions);
    container.add_row(
      this.gapRow(_('Outer margin'), layout.outerGap, (value) =>
        this.mutate(
          data,
          profileId,
          save,
          (target) => (target.monitors[monitorIndex]!.outerGap = value),
        ),
      ),
    );
    container.add_row(
      this.gapRow(_('Space between zones'), layout.innerGap, (value) =>
        this.mutate(
          data,
          profileId,
          save,
          (target) => (target.monitors[monitorIndex]!.innerGap = value),
        ),
      ),
    );
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

  mutate(
    data: ZonecraftData,
    profileId: string,
    save: (data: ZonecraftData) => void,
    mutation: (profile: LayoutProfile) => void,
  ): void {
    const next = cloneData(data);
    mutation(next.profiles.find((profile) => profile.id === profileId)!);
    save(next);
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

function pixelBoundaries(weights: number[], size: number): number[] {
  const result = [0];
  let cumulative = 0;
  for (const weight of weights) {
    cumulative += weight;
    result.push(Math.round((cumulative * size) / WEIGHT_TOTAL));
  }
  return result;
}

function trackAt(weights: number[], coordinate: number, size: number): number {
  const boundaries = pixelBoundaries(weights, size);
  return Math.max(
    0,
    boundaries.findIndex((boundary, index) => index > 0 && coordinate < boundary) - 1,
  );
}

function nearestSeparator(
  weights: number[],
  coordinate: number,
  size: number,
): { index: number; distance: number } | null {
  const candidates = pixelBoundaries(weights, size)
    .slice(1, -1)
    .map((position, index) => ({ index, distance: Math.abs(position - coordinate) }))
    .filter(({ distance }) => distance <= 10)
    .sort((a, b) => a.distance - b.distance);
  return candidates[0] ?? null;
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
