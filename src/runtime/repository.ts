// SPDX-License-Identifier: GPL-3.0-or-later

import { emptyData, parseData, serializeData } from '../core/profiles.js';
import type { ZonecraftData } from '../core/types.js';

export class ProfileRepository {
  readonly settings: any;
  #data: ZonecraftData = emptyData();
  #error: Error | null = null;
  #callbacks = new Set<() => void>();
  #signalId = 0;

  constructor(settings: any) {
    this.settings = settings;
    this.reload();
    this.#signalId = settings.connect('changed::profiles-json', () => {
      this.reload();
      for (const callback of this.#callbacks) callback();
    });
  }

  get data(): ZonecraftData {
    return JSON.parse(JSON.stringify(this.#data)) as ZonecraftData;
  }

  get error(): Error | null {
    return this.#error;
  }

  subscribe(callback: () => void): () => void {
    this.#callbacks.add(callback);
    return () => this.#callbacks.delete(callback);
  }

  save(data: ZonecraftData): void {
    this.settings.set_string('profiles-json', serializeData(data));
  }

  reset(): void {
    this.save(emptyData());
  }

  destroy(): void {
    if (this.#signalId) this.settings.disconnect(this.#signalId);
    this.#signalId = 0;
    this.#callbacks.clear();
  }

  private reload(): void {
    try {
      this.#data = parseData(this.settings.get_string('profiles-json'));
      this.#error = null;
    } catch (error) {
      this.#error = error instanceof Error ? error : new Error(String(error));
    }
  }
}
