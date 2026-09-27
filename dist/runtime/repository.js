// SPDX-License-Identifier: GPL-3.0-or-later
import { emptyData, parseData, serializeData } from '../core/profiles.js';
export class ProfileRepository {
    settings;
    #data = emptyData();
    #error = null;
    #callbacks = new Set();
    #signalId = 0;
    constructor(settings) {
        this.settings = settings;
        this.reload();
        this.#signalId = settings.connect('changed::profiles-json', () => {
            this.reload();
            for (const callback of this.#callbacks)
                callback();
        });
    }
    get data() {
        return JSON.parse(JSON.stringify(this.#data));
    }
    get error() {
        return this.#error;
    }
    subscribe(callback) {
        this.#callbacks.add(callback);
        return () => this.#callbacks.delete(callback);
    }
    save(data) {
        this.settings.set_string('profiles-json', serializeData(data));
    }
    reset() {
        this.save(emptyData());
    }
    destroy() {
        if (this.#signalId)
            this.settings.disconnect(this.#signalId);
        this.#signalId = 0;
        this.#callbacks.clear();
    }
    reload() {
        try {
            this.#data = parseData(this.settings.get_string('profiles-json'));
            this.#error = null;
        }
        catch (error) {
            this.#error = error instanceof Error ? error : new Error(String(error));
        }
    }
}
