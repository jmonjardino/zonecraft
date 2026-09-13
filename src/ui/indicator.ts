// SPDX-License-Identifier: GPL-3.0-or-later

import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import type { LayoutProfile } from '../core/types.js';
import type { ProfileRepository } from '../runtime/repository.js';

type IndicatorCallbacks = {
  activateProfile: (profile: LayoutProfile) => void;
  openPreferences: () => void;
  undo: () => void;
};

export const ZonecraftIndicator = GObject.registerClass(
  class ZonecraftIndicator extends PanelMenu.Button {
    #repository: ProfileRepository;
    #callbacks: IndicatorCallbacks;
    #unsubscribe: () => void;
    #canUndo = false;

    constructor(repository: ProfileRepository, callbacks: IndicatorCallbacks) {
      super(0, 'Zonecraft');
      this.#repository = repository;
      this.#callbacks = callbacks;
      this.add_child(
        new St.Icon({ icon_name: 'view-grid-symbolic', style_class: 'system-status-icon' }),
      );
      this.#unsubscribe = repository.subscribe(() => this.rebuild());
      this.rebuild();
      Main.panel.addToStatusArea('zonecraft', this);
    }

    setCanUndo(canUndo: boolean): void {
      this.#canUndo = canUndo;
      this.rebuild();
    }

    rebuild(): void {
      this.menu.removeAll();
      if (this.#repository.error) {
        const error = new PopupMenu.PopupMenuItem('Profiles unavailable', { reactive: false });
        error.add_style_class_name('zonecraft-menu-error');
        this.menu.addMenuItem(error);
      } else if (this.#repository.data.profiles.length === 0) {
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No profiles yet', { reactive: false }));
      } else {
        for (const profile of this.#repository.data.profiles) {
          const item = new PopupMenu.PopupMenuItem(profile.name);
          item.connect('activate', () => this.#callbacks.activateProfile(profile));
          this.menu.addMenuItem(item);
        }
      }
      if (this.#canUndo) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const undo = new PopupMenu.PopupMenuItem('Undo last layout');
        undo.connect('activate', () => this.#callbacks.undo());
        this.menu.addMenuItem(undo);
      }
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const preferences = new PopupMenu.PopupMenuItem('Manage profiles…');
      preferences.connect('activate', () => this.#callbacks.openPreferences());
      this.menu.addMenuItem(preferences);
    }

    destroy(): void {
      this.#unsubscribe();
      super.destroy();
    }
  },
);
