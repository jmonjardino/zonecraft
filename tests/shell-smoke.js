// SPDX-License-Identifier: GPL-3.0-or-later

import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'zonecraft@jmonjardino.dev';

export const METRICS = {};

export async function run() {
  await Scripting.sleep(1000);
}

export function finish() {
  const extension = Main.extensionManager.lookup(UUID);
  if (!extension) throw new Error(`${UUID} was not loaded.`);
  if (extension.state !== ExtensionState.ACTIVE)
    throw new Error(`${UUID} is not active; current state is ${extension.state}.`);
}
