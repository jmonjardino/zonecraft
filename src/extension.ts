// SPDX-License-Identifier: GPL-3.0-or-later
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { bindMonitorLayouts, roleKey } from './core/monitors.js';
import type { LayoutProfile, LogicalMonitor, Rectangle } from './core/types.js';
import { ProfileRepository } from './runtime/repository.js';
import {
  applyAssignments,
  listWindowCandidates,
  restoreSnapshots,
  snapshotAssignments,
  type WindowAssignment,
  type WindowSnapshot,
} from './runtime/windows.js';
import { AssignmentOverlay, ProfileChooserOverlay } from './ui/assignmentOverlay.js';
import { ZonecraftIndicator } from './ui/indicator.js';

const shellGlobal = global as any;

export default class ZonecraftExtension extends Extension {
  #repository: ProfileRepository | null = null;
  #indicator: any = null;
  #overlay: { destroy: () => void } | null = null;
  #undoSnapshots: WindowSnapshot[] = [];
  #monitorsChangedId = 0;
  #indicatorSettingId = 0;

  enable(): void {
    const settings = this.getSettings();
    this.#repository = new ProfileRepository(settings);
    if (settings.get_boolean('show-panel-indicator')) this.#createIndicator();
    this.#indicatorSettingId = settings.connect('changed::show-panel-indicator', () => {
      if (settings.get_boolean('show-panel-indicator')) this.#createIndicator();
      else {
        this.#indicator?.destroy();
        this.#indicator = null;
      }
    });
    Main.wm.addKeybinding(
      'open-selector',
      settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this.#openProfileSelector(),
    );
    this.#monitorsChangedId = Main.layoutManager.connect('monitors-changed', () =>
      this.#cancelOverlay(),
    );
  }

  disable(): void {
    this.#cancelOverlay();
    if (this.#monitorsChangedId) Main.layoutManager.disconnect(this.#monitorsChangedId);
    this.#monitorsChangedId = 0;
    if (this.#indicatorSettingId && this.#repository)
      this.#repository.settings.disconnect(this.#indicatorSettingId);
    this.#indicatorSettingId = 0;
    Main.wm.removeKeybinding('open-selector');
    this.#indicator?.destroy();
    this.#indicator = null;
    this.#repository?.destroy();
    this.#repository = null;
    this.#undoSnapshots = [];
  }

  #createIndicator(): void {
    if (!this.#repository || this.#indicator) return;
    this.#indicator = new ZonecraftIndicator(this.#repository, {
      activateProfile: (profile: LayoutProfile) => this.#activateProfile(profile),
      openPreferences: () => this.openPreferences(),
      undo: () => this.#undo(),
    });
  }

  #openProfileSelector(): void {
    if (!this.#repository || this.#repository.error) {
      Main.notifyError(
        _('Zonecraft'),
        _('Profiles are unavailable. Open preferences to repair them.'),
      );
      return;
    }
    const profiles = this.#repository.data.profiles;
    if (profiles.length === 0) {
      Main.notify(_('Zonecraft'), _('Create a profile in preferences first.'));
      this.openPreferences();
    } else if (profiles.length === 1) this.#activateProfile(profiles[0]!);
    else {
      this.#cancelOverlay();
      this.#overlay = new ProfileChooserOverlay(
        profiles,
        (profile) => {
          this.#cancelOverlay();
          this.#activateProfile(profile);
        },
        () => this.#cancelOverlay(),
      );
    }
  }

  #activateProfile(profile: LayoutProfile): void {
    this.#cancelOverlay();
    const monitors = this.#logicalMonitors();
    const { bindings, missing } = bindMonitorLayouts(profile.monitors, monitors);
    if (bindings.length === 0) {
      Main.notifyError(
        _('Zonecraft'),
        _('No monitor required by this profile is currently available.'),
      );
      return;
    }
    const workspace = shellGlobal.workspace_manager.get_active_workspace();
    const workAreas = new Map<number, Rectangle>();
    for (const binding of bindings) {
      const area = workspace.get_work_area_for_monitor(binding.monitor.index);
      workAreas.set(binding.monitor.index, {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
      });
    }
    this.#overlay = new AssignmentOverlay({
      profile,
      bindings,
      candidates: listWindowCandidates(workspace),
      workAreas,
      missingRoles: missing.map(roleKey),
      onCancel: () => this.#cancelOverlay(),
      onApply: (assignments) => this.#apply(profile, assignments, workAreas),
    });
  }

  #apply(
    profile: LayoutProfile,
    assignments: WindowAssignment[],
    workAreas: Map<number, Rectangle>,
  ): void {
    this.#undoSnapshots = snapshotAssignments(assignments);
    const failures = applyAssignments(assignments, workAreas);
    this.#saveHints(profile, assignments);
    this.#cancelOverlay();
    this.#indicator?.setCanUndo(this.#undoSnapshots.length > 0);
    if (failures.length > 0)
      Main.notifyError(_('Zonecraft applied with errors'), failures.join('\n'));
    else Main.notify(_('Zonecraft'), _(`Placed ${assignments.length} window(s).`));
  }

  #saveHints(profile: LayoutProfile, assignments: WindowAssignment[]): void {
    if (!this.#repository) return;
    const data = this.#repository.data;
    const stored = data.profiles.find((candidate) => candidate.id === profile.id);
    if (!stored) return;
    for (const assignment of assignments) {
      const monitor = stored.monitors.find(
        (candidate) => roleKey(candidate.role) === roleKey(assignment.binding.layout.role),
      );
      const zone = monitor?.zones.find((candidate) => candidate.id === assignment.zone.id);
      if (zone && assignment.candidate.hint) zone.appHint = assignment.candidate.hint;
    }
    this.#repository.save(data);
  }

  #undo(): void {
    const failures = restoreSnapshots(this.#undoSnapshots);
    this.#undoSnapshots = [];
    this.#indicator?.setCanUndo(false);
    if (failures.length > 0) Main.notifyError(_('Zonecraft undo failed'), failures.join('\n'));
    else Main.notify(_('Zonecraft'), _('The previous window layout was restored.'));
  }

  #cancelOverlay(): void {
    this.#overlay?.destroy();
    this.#overlay = null;
  }

  #logicalMonitors(): LogicalMonitor[] {
    return Main.layoutManager.monitors.map((monitor: any, index: number) => ({
      index: monitor.index ?? index,
      primary: (monitor.index ?? index) === Main.layoutManager.primaryIndex,
      x: monitor.x,
      y: monitor.y,
      width: monitor.width,
      height: monitor.height,
      scale: shellGlobal.display.get_monitor_scale(monitor.index ?? index),
    }));
  }
}
