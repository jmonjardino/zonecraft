// SPDX-License-Identifier: GPL-3.0-or-later
// Generated with AI for personal use.
// Do NOT upload to extensions.gnome.org (EGO) unless you understand JavaScript
// and can maintain this code.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import { ExtensionPreferences, gettext as _, } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { calculateZoneRectangles, layoutDividers } from './core/geometry.js';
import { clampRatio, layoutZones, nodeAt, removeZone, setSplitRatio, splitZone, } from './core/layout.js';
import { createProfileFromMonitors, findTopologyMonitor, orientationOf, parseTopology, templateLayout, transposeNode, } from './core/orientation.js';
import { layoutOrientation, monitorShape, profilePreview } from './core/preview.js';
import { createDefaultProfile, emptyData, nextUniqueName, parseData, serializeData, } from './core/profiles.js';
import { WEIGHT_TOTAL, } from './core/types.js';
const PREVIEW_PADDING = 4;
const PREVIEW_GAP = 8;
const DIVIDER_GRAB_DISTANCE = 6;
const CARD_PREVIEW_PADDING = 12;
/** Space kept around each zone in the card previews, so neighbours stay apart. */
const CARD_ZONE_INSET = 3;
const CARD_WIDTH = 250;
/** Size used for monitors that are not connected right now. */
const FALLBACK_MONITOR = { width: 1920, height: 1080 };
const ProfilePreviewArea = GObject.registerClass(class ProfilePreviewArea extends Gtk.DrawingArea {
    profile;
    topology;
    styleIds = [];
    constructor(options) {
        super({ height_request: 150, hexpand: true, css_classes: ['caption'] });
        this.profile = options.profile;
        this.topology = options.topology;
        this.set_draw_func((_widget, context, width, height) => this.draw(context, width, height));
        // The accent colour and dark style can change while the window is open.
        const style = Adw.StyleManager.get_default();
        this.connect('realize', () => {
            this.styleIds = ['notify::dark', 'notify::accent-color-rgba'].map((signal) => style.connect(signal, () => this.queue_draw()));
        });
        this.connect('unrealize', () => {
            for (const id of this.styleIds)
                style.disconnect(id);
            this.styleIds = [];
        });
    }
    draw(context, width, height) {
        const foreground = this.get_color();
        const accent = Adw.StyleManager.get_default().get_accent_color_rgba();
        const profile = this.profile();
        const preview = profile ? profilePreview(profile, this.topology()) : null;
        const padding = CARD_PREVIEW_PADDING;
        const available = { width: width - padding * 2, height: height - padding * 2 };
        if (available.width <= 0 || available.height <= 0)
            return;
        if (!preview || preview.monitors.length === 0) {
            roundedRectangle(context, { x: padding, y: padding, ...available }, 8);
            setColor(context, foreground, 0.35);
            context.setLineWidth(1.5);
            context.setDash([6, 4], 0);
            context.stroke();
            context.setDash([], 0);
            this.drawLabel(context, _('No preview'), { x: padding, y: padding, ...available }, 0.6);
            return;
        }
        const boxWidth = Math.min(available.width, available.height * preview.aspect);
        const boxHeight = Math.min(available.height, available.width / preview.aspect);
        const box = {
            x: padding + (available.width - boxWidth) / 2,
            y: padding + (available.height - boxHeight) / 2,
            width: boxWidth,
            height: boxHeight,
        };
        const scale = (rect) => ({
            x: box.x + rect.x * box.width,
            y: box.y + rect.y * box.height,
            width: rect.width * box.width,
            height: rect.height * box.height,
        });
        for (const monitor of preview.monitors) {
            const screen = scale(monitor.rect);
            roundedRectangle(context, screen, 4);
            setColor(context, foreground, 0.08);
            context.fillPreserve();
            setColor(context, foreground, monitor.primary ? 0.55 : 0.3);
            context.setLineWidth(1);
            context.stroke();
            for (const zone of monitor.zones) {
                const rect = inset(scale(zone.rect), CARD_ZONE_INSET);
                if (rect.width <= 0 || rect.height <= 0)
                    continue;
                roundedRectangle(context, rect, 2);
                setColor(context, accent, 0.3);
                context.fillPreserve();
                setColor(context, accent, 0.9);
                context.setLineWidth(1);
                context.stroke();
                // The name when it fits, otherwise the zone number, otherwise nothing.
                if (!this.drawLabel(context, zone.name, rect, 0.9))
                    this.drawLabel(context, String(zone.number), rect, 0.9);
            }
        }
    }
    /** Draws `text` centred in `area` if it fits. Returns whether it was drawn. */
    drawLabel(context, text, area, alpha) {
        const layout = this.create_pango_layout(text);
        const [textWidth, textHeight] = layout.get_pixel_size();
        if (textWidth + 6 > area.width || textHeight + 2 > area.height)
            return false;
        setColor(context, this.get_color(), alpha);
        context.moveTo(area.x + (area.width - textWidth) / 2, area.y + (area.height - textHeight) / 2);
        PangoCairo.show_layout(context, layout);
        return true;
    }
});
const GridPreview = GObject.registerClass(class GridPreview extends Gtk.DrawingArea {
    layout;
    aspect;
    selectedZone;
    onSelect;
    onResized;
    drag = null;
    pressX = 0;
    pressY = 0;
    constructor(options) {
        super({
            hexpand: true,
            height_request: options.aspect < 1 ? 360 : 260,
            focusable: true,
            margin_top: 12,
            margin_bottom: 6,
        });
        this.layout = options.layout;
        this.aspect = options.aspect;
        this.selectedZone = options.selectedZone;
        this.onSelect = options.onSelect;
        this.onResized = options.onResized;
        this.set_draw_func((_widget, context, width, height) => this.draw(context, width, height));
        const drag = new Gtk.GestureDrag();
        drag.connect('drag-begin', (_gesture, x, y) => this.beginDrag(x, y));
        drag.connect('drag-update', (_gesture, dx, dy) => this.updateDrag(dx, dy));
        drag.connect('drag-end', (_gesture, dx, dy) => this.endDrag(dx, dy));
        this.add_controller(drag);
        const motion = new Gtk.EventControllerMotion();
        motion.connect('motion', (_controller, x, y) => {
            if (this.drag)
                return;
            const divider = this.dividerAt(x, y);
            this.set_cursor_from_name(divider ? resizeCursor(divider.axis) : null);
        });
        this.add_controller(motion);
    }
    /** The largest rectangle with the monitor's proportions, centred in the widget. */
    area() {
        const available = {
            width: this.get_width() - PREVIEW_PADDING * 2,
            height: this.get_height() - PREVIEW_PADDING * 2,
        };
        const width = Math.min(available.width, available.height * this.aspect);
        const height = Math.min(available.height, available.width / this.aspect);
        return {
            x: PREVIEW_PADDING + (available.width - width) / 2,
            y: PREVIEW_PADDING + (available.height - height) / 2,
            width,
            height,
        };
    }
    draw(context, width, height) {
        context.setSourceRGB(0.12, 0.13, 0.15);
        context.paint();
        const layout = this.layout();
        if (!layout || width <= PREVIEW_PADDING * 2 || height <= PREVIEW_PADDING * 2)
            return;
        const selected = this.selectedZone();
        for (const [zone, rectangle] of previewZones(layout, this.area())) {
            const isSelected = zone.id === selected;
            context.setSourceRGBA(isSelected ? 0.18 : 0.12, isSelected ? 0.55 : 0.35, isSelected ? 0.92 : 0.72, isSelected ? 0.72 : 0.46);
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
    dividerAt(x, y) {
        const layout = this.layout();
        if (!layout)
            return null;
        let best = null;
        for (const divider of layoutDividers(layout.root, this.area(), PREVIEW_GAP, 'lenient')) {
            const { line } = divider;
            const along = divider.axis === 'horizontal' ? y : x;
            const start = divider.axis === 'horizontal' ? line.y : line.x;
            const length = divider.axis === 'horizontal' ? line.height : line.width;
            if (along < start || along > start + length)
                continue;
            const center = divider.axis === 'horizontal' ? line.x + line.width / 2 : line.y + line.height / 2;
            const distance = Math.abs((divider.axis === 'horizontal' ? x : y) - center);
            if (distance > PREVIEW_GAP / 2 + DIVIDER_GRAB_DISTANCE)
                continue;
            if (!best || distance < best.distance)
                best = { divider, distance };
        }
        return best?.divider ?? null;
    }
    beginDrag(x, y) {
        this.pressX = x;
        this.pressY = y;
        const divider = this.dividerAt(x, y);
        this.drag = divider ? { divider, startX: x, startY: y } : null;
        this.grab_focus();
    }
    updateDrag(dx, dy) {
        const layout = this.layout();
        if (!this.drag || !layout)
            return;
        const { divider, startX, startY } = this.drag;
        const horizontal = divider.axis === 'horizontal';
        const pointer = horizontal ? startX + dx : startY + dy;
        const origin = horizontal ? divider.area.x : divider.area.y;
        const size = (horizontal ? divider.area.width : divider.area.height) - PREVIEW_GAP;
        if (size <= 0)
            return;
        setSplitRatio(layout, divider.path, ((pointer - origin - PREVIEW_GAP / 2) * WEIGHT_TOTAL) / size);
        this.queue_draw();
    }
    endDrag(dx, dy) {
        const resized = this.drag !== null;
        this.drag = null;
        if (resized) {
            this.onResized();
            return;
        }
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4)
            return;
        const layout = this.layout();
        if (!layout)
            return;
        for (const [zone, rectangle] of previewZones(layout, this.area()))
            if (contains(rectangle, this.pressX, this.pressY)) {
                this.onSelect(zone.id);
                this.queue_draw();
                return;
            }
    }
});
export default class ZonecraftPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(900, 720);
        const settings = this.getSettings();
        let data;
        try {
            data = parseData(settings.get_string('profiles-json'));
        }
        catch (error) {
            this.showRepairPage(window, settings, error instanceof Error ? error.message : String(error));
            return;
        }
        // One page for the lifetime of the window. Swapping pages while AdwViewStack
        // animates the transition crashed GJS once the old page had been removed.
        const page = new Adw.PreferencesPage({ title: _('Profiles'), icon_name: 'view-grid-symbolic' });
        window.add(page);
        let groups = [];
        // The profile editor is a subpage pushed over the cards; its groups are rebuilt in place.
        let editor = null;
        let renderSource = 0;
        const renderEditor = () => {
            if (!editor)
                return;
            const profile = data.profiles.find((candidate) => candidate.id === editor.profileId);
            if (!profile) {
                window.pop_subpage();
                return;
            }
            editor.page.title = profile.name;
            for (const group of editor.groups)
                editor.content.remove(group);
            editor.groups = this.buildEditorGroups(context, profile.id);
            for (const group of editor.groups)
                editor.content.add(group);
        };
        const render = () => {
            for (const group of groups)
                page.remove(group);
            context.cardPreviews = [];
            groups = this.buildGroups(context);
            for (const group of groups)
                page.add(group);
            renderEditor();
        };
        // Rebuild on idle: the widget that emitted a signal must outlive its handler.
        const scheduleRender = () => {
            if (!renderSource)
                renderSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    renderSource = 0;
                    render();
                    return GLib.SOURCE_REMOVE;
                });
        };
        let topologyJson = settings.get_string('monitor-topology');
        let topology = parseTopology(topologyJson);
        const topologyId = settings.connect('changed::monitor-topology', () => {
            const next = settings.get_string('monitor-topology');
            if (next === topologyJson)
                return;
            topologyJson = next;
            topology = parseTopology(next);
            scheduleRender();
        });
        // Keeps the cards in step with the saved profiles: edits made here only need a redraw,
        // changes written by anything else are loaded again.
        let savedJson = settings.get_string('profiles-json');
        const profilesId = settings.connect('changed::profiles-json', () => {
            const next = settings.get_string('profiles-json');
            if (next === savedJson) {
                for (const preview of context.cardPreviews)
                    preview.queue_draw();
                return;
            }
            savedJson = next;
            try {
                data = parseData(next);
            }
            catch {
                return;
            }
            scheduleRender();
        });
        const context = {
            window,
            settings,
            data: () => data,
            commit: (mutation, rerender = true) => {
                const snapshot = JSON.stringify(data);
                try {
                    mutation(data);
                    const json = serializeData(data);
                    savedJson = json;
                    settings.set_string('profiles-json', json);
                }
                catch (error) {
                    data = JSON.parse(snapshot);
                    rerender = true;
                    window.add_toast(new Adw.Toast({ title: error instanceof Error ? error.message : String(error) }));
                }
                if (rerender)
                    scheduleRender();
            },
            openEditor: (profileId) => {
                const profile = data.profiles.find((candidate) => candidate.id === profileId);
                if (!profile || editor)
                    return;
                const content = new Adw.PreferencesPage();
                const header = new Adw.HeaderBar();
                header.pack_end(this.applyButton(context, profileId));
                const toolbar = new Adw.ToolbarView({ content });
                toolbar.add_top_bar(header);
                const subpage = new Adw.NavigationPage({ title: profile.name, child: toolbar });
                const opened = { profileId, page: subpage, content, groups: [] };
                // Otherwise the name entry takes the focus and selects the whole name.
                subpage.connect('shown', () => window.set_focus(null));
                subpage.connect('hidden', () => {
                    if (editor === opened)
                        editor = null;
                });
                editor = opened;
                renderEditor();
                window.push_subpage(subpage);
            },
            selectedZones: new Map(),
            topology: () => topology,
            cardPreviews: [],
        };
        window.connect('close-request', () => {
            settings.disconnect(topologyId);
            settings.disconnect(profilesId);
            if (renderSource)
                GLib.source_remove(renderSource);
            renderSource = 0;
            return false;
        });
        render();
    }
    buildGroups(context) {
        const { settings, window } = context;
        const profilesGroup = new Adw.PreferencesGroup({
            title: _('Layout profiles'),
            description: _('Create layouts for the primary monitor and monitors around it. New layouts follow the shape of the connected monitor: rows on vertical monitors, columns on horizontal ones.'),
        });
        const profiles = context.data().profiles;
        if (profiles.length > 0) {
            const cards = new Gtk.FlowBox({
                selection_mode: Gtk.SelectionMode.NONE,
                homogeneous: true,
                min_children_per_line: 1,
                max_children_per_line: 4,
                column_spacing: 12,
                row_spacing: 12,
                activate_on_single_click: true,
            });
            const cardProfiles = new Map();
            for (const profile of profiles) {
                const card = this.buildProfileCard(context, profile);
                cards.append(card);
                cardProfiles.set(card, profile.id);
            }
            cards.connect('child-activated', (_box, card) => {
                const profileId = cardProfiles.get(card);
                if (profileId)
                    context.openEditor(profileId);
            });
            profilesGroup.add(cards);
        }
        else {
            const empty = new Gtk.Label({
                label: _('No profiles yet. Create one below.'),
                css_classes: ['dim-label'],
                margin_top: 12,
                margin_bottom: 12,
            });
            profilesGroup.add(empty);
        }
        const createGroup = new Adw.PreferencesGroup();
        const addProfile = new Adw.ButtonRow({
            title: _('Create profile'),
            start_icon_name: 'list-add-symbolic',
        });
        const createProfile = (monitors) => {
            let createdId;
            context.commit((data) => {
                const name = nextUniqueName(data.profiles, 'My layout');
                const profile = monitors.length > 0
                    ? createProfileFromMonitors(randomId(), name, monitors, randomId)
                    : createDefaultProfile(randomId(), name);
                data.profiles.push(profile);
                createdId = profile.id;
            });
            if (createdId)
                context.openEditor(createdId);
        };
        const topology = context.topology();
        addProfile.connect('activated', () => createProfile(topology.filter((monitor) => monitor.role.kind === 'primary')));
        createGroup.add(addProfile);
        if (topology.length > 1) {
            const addForMonitors = new Adw.ButtonRow({
                title: _(`Create profile for the ${topology.length} connected monitors`),
                start_icon_name: 'video-display-symbolic',
            });
            addForMonitors.connect('activated', () => createProfile(topology));
            createGroup.add(addForMonitors);
        }
        const behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
        behavior.add(this.shortcutRow(window, settings));
        const showIndicator = new Adw.SwitchRow({
            title: _('Show panel indicator'),
            active: settings.get_boolean('show-panel-indicator'),
        });
        showIndicator.connect('notify::active', () => settings.set_boolean('show-panel-indicator', showIndicator.active));
        behavior.add(showIndicator);
        return [profilesGroup, createGroup, behavior];
    }
    applyButton(context, profileId) {
        const apply = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Apply profile'),
        });
        apply.connect('clicked', () => 
        // GNOME Shell listens for this key and opens the assignment overlay.
        context.settings.set_string('activate-profile', `${profileId}:${GLib.get_monotonic_time()}`));
        return apply;
    }
    /** A card with a drawing of the profile's monitors and zones, and its actions. */
    buildProfileCard(context, profile) {
        const profileId = profile.id;
        const findProfile = (data) => data.profiles.find((candidate) => candidate.id === profileId);
        const preview = new ProfilePreviewArea({
            profile: () => context.data().profiles.find((candidate) => candidate.id === profileId),
            topology: context.topology,
        });
        context.cardPreviews.push(preview);
        const zoneCount = profile.monitors.reduce((total, monitor) => total + layoutZones(monitor).length, 0);
        const labels = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        labels.append(new Gtk.Label({
            label: profile.name,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            // Long names are cut instead of widening every card in the grid.
            max_width_chars: 1,
            css_classes: ['heading'],
        }));
        labels.append(new Gtk.Label({
            label: `${_(`${profile.monitors.length} monitor(s)`)} · ${_(`${zoneCount} zone(s)`)}`,
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            max_width_chars: 1,
            css_classes: ['dim-label', 'caption'],
        }));
        const footer = new Gtk.Box({
            spacing: 6,
            margin_start: 12,
            margin_end: 6,
            margin_bottom: 6,
        });
        footer.append(labels);
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['card', 'activatable'],
            width_request: CARD_WIDTH,
            tooltip_text: _('Edit profile'),
        });
        card.append(preview);
        card.append(footer);
        const apply = this.applyButton(context, profileId);
        apply.add_css_class('flat');
        footer.append(apply);
        const duplicate = new Gtk.Button({
            icon_name: 'edit-copy-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Duplicate profile'),
            css_classes: ['flat'],
        });
        duplicate.connect('clicked', () => context.commit((data) => {
            const copy = cloneData(findProfile(data));
            copy.id = randomId();
            copy.name = nextUniqueName(data.profiles, `${copy.name} copy`);
            for (const monitor of copy.monitors)
                for (const zone of layoutZones(monitor))
                    zone.id = randomId();
            data.profiles.push(copy);
        }));
        footer.append(duplicate);
        const remove = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Delete profile'),
            css_classes: ['flat', 'error'],
        });
        remove.connect('clicked', () => this.confirmDelete(context.window, profile.name, () => context.commit((data) => {
            data.profiles = data.profiles.filter((item) => item.id !== profileId);
        })));
        footer.append(remove);
        return new Gtk.FlowBoxChild({ child: card });
    }
    /** The groups of the profile editor: name, one group per monitor and adding monitors. */
    buildEditorGroups(context, profileId) {
        const findProfile = (data) => data.profiles.find((candidate) => candidate.id === profileId);
        const profile = findProfile(context.data());
        const profileGroup = new Adw.PreferencesGroup();
        const name = new Adw.EntryRow({ title: _('Profile name'), text: profile.name });
        name.connect('apply', () => {
            const value = name.text.trim();
            const taken = context
                .data()
                .profiles.some((candidate) => candidate.id !== profileId &&
                candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase());
            if (!value || taken) {
                context.window.add_toast(new Adw.Toast({ title: _('Profile names must be non-empty and unique') }));
                return;
            }
            context.commit((data) => (findProfile(data).name = value));
        });
        profileGroup.add(name);
        const groups = [profileGroup];
        for (let monitorIndex = 0; monitorIndex < profile.monitors.length; monitorIndex++)
            groups.push(this.buildMonitorEditor(context, profileId, monitorIndex));
        const addMonitorGroup = new Adw.PreferencesGroup();
        const addMonitorRow = new Adw.ActionRow({ title: _('Add monitor layout') });
        for (const direction of ['left', 'right', 'above', 'below']) {
            const button = new Gtk.Button({ label: _(capitalize(direction)), valign: Gtk.Align.CENTER });
            button.connect('clicked', () => context.commit((data) => {
                const target = findProfile(data);
                const rank = 1 +
                    target.monitors.filter((monitor) => monitor.role.kind === 'relative' && monitor.role.direction === direction).length;
                const role = { kind: 'relative', direction, rank };
                const connected = findTopologyMonitor(context.topology(), role);
                target.monitors.push(templateLayout(role, connected ?? FALLBACK_MONITOR, randomId));
            }));
            addMonitorRow.add_suffix(button);
        }
        addMonitorGroup.add(addMonitorRow);
        groups.push(addMonitorGroup);
        return groups;
    }
    buildMonitorEditor(context, profileId, monitorIndex) {
        const findLayout = (data) => data.profiles.find((candidate) => candidate.id === profileId)?.monitors[monitorIndex];
        const edit = (mutation, rerender = true) => context.commit((data) => mutation(findLayout(data)), rerender);
        const layout = findLayout(context.data());
        const selectionKey = `${profileId}/${monitorIndex}`;
        const selectedZone = () => {
            const current = findLayout(context.data());
            if (!current)
                return undefined;
            const zones = layoutZones(current);
            const selected = context.selectedZones.get(selectionKey);
            return zones.some((zone) => zone.id === selected) ? selected : zones[0]?.id;
        };
        const zones = layoutZones(layout);
        const connected = findTopologyMonitor(context.topology(), layout.role);
        const orientation = layoutOrientation(layout, connected);
        const title = layout.role.kind === 'primary'
            ? _('Primary monitor')
            : _(`${capitalize(layout.role.direction)} monitor ${layout.role.rank}`);
        const status = connected
            ? _(`connected: ${orientationLabel(orientationOf(connected))}, ${connected.width}×${connected.height}`)
            : _('not connected');
        const group = new Adw.PreferencesGroup({
            title,
            description: `${_(`${zones.length} zone(s)`)} · ${status}`,
        });
        if (layout.role.kind !== 'primary') {
            const remove = new Gtk.Button({
                icon_name: 'list-remove-symbolic',
                tooltip_text: _('Remove monitor layout'),
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            remove.connect('clicked', () => context.commit((data) => data.profiles
                .find((candidate) => candidate.id === profileId)
                .monitors.splice(monitorIndex, 1)));
            group.set_header_suffix(remove);
        }
        const editor = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
        });
        const preview = new GridPreview({
            layout: () => findLayout(context.data()),
            aspect: aspectOf(monitorShape(layout, connected)),
            selectedZone,
            onSelect: (zoneId) => context.selectedZones.set(selectionKey, zoneId),
            // The preview already shows the new size, so only persist it.
            onResized: () => edit(() => undefined, false),
        });
        editor.append(preview);
        const hint = new Gtk.Label({
            label: _('Click a zone to select it, then split or remove it. Drag the gap between zones to resize.'),
            wrap: true,
            xalign: 0,
        });
        hint.add_css_class('dim-label');
        hint.add_css_class('caption');
        editor.append(hint);
        const actions = new Adw.WrapBox({ child_spacing: 6, line_spacing: 6 });
        const splitAction = (label, axis) => {
            const button = new Gtk.Button({ label });
            button.connect('clicked', () => {
                const zoneId = selectedZone();
                if (!zoneId)
                    return;
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
            if (zoneId)
                edit((target) => removeZone(target, zoneId));
        });
        actions.append(removeButton);
        const equalize = new Gtk.Button({ label: _('Reset sizes') });
        equalize.set_sensitive(layout.root.kind === 'split');
        equalize.connect('clicked', () => edit((target) => resetRatios(target)));
        actions.append(equalize);
        editor.append(actions);
        group.add(new Adw.PreferencesRow({ activatable: false, child: editor }));
        for (const zone of zones) {
            const zoneName = new Adw.EntryRow({ title: _('Zone name'), text: zone.name });
            zoneName.connect('apply', () => {
                const value = zoneName.text.trim();
                const current = findLayout(context.data());
                const duplicate = !current ||
                    layoutZones(current).some((candidate) => candidate.id !== zone.id &&
                        candidate.name.toLocaleLowerCase() === value.toLocaleLowerCase());
                if (!value || duplicate) {
                    context.window.add_toast(new Adw.Toast({ title: _('Zone names must be non-empty and unique') }));
                    return;
                }
                edit((target) => {
                    layoutZones(target).find((candidate) => candidate.id === zone.id).name = value;
                }, false);
                preview.queue_draw();
            });
            group.add(zoneName);
        }
        const orientations = ['landscape', 'portrait'];
        const orientationRow = new Adw.ComboRow({
            title: _('Orientation'),
            subtitle: _('Changing it turns rows into columns and back'),
            model: Gtk.StringList.new(orientations.map(orientationLabel)),
            selected: orientations.indexOf(orientation),
        });
        orientationRow.connect('notify::selected', () => {
            const chosen = orientations[orientationRow.selected];
            if (!chosen || chosen === orientation)
                return;
            edit((target) => {
                target.root = transposeNode(target.root);
                target.orientation = chosen;
            });
        });
        group.add(orientationRow);
        const adapt = new Adw.SwitchRow({
            title: _('Adapt to rotated monitors'),
            subtitle: _('Swap rows and columns when the monitor is turned the other way'),
            active: layout.orientation !== undefined && layout.adaptOrientation !== false,
        });
        adapt.connect('notify::active', () => edit((target) => {
            // Layouts from earlier versions have no orientation; pin the one shown.
            target.orientation ??= orientation;
            if (adapt.active)
                delete target.adaptOrientation;
            else
                target.adaptOrientation = false;
        }, false));
        group.add(adapt);
        group.add(this.gapRow(_('Outer margin'), layout.outerGap, (value) => edit((target) => (target.outerGap = value), false)));
        group.add(this.gapRow(_('Space between zones'), layout.innerGap, (value) => edit((target) => (target.innerGap = value), false)));
        return group;
    }
    shortcutRow(window, settings) {
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
        const refresh = () => {
            label.accelerator = settings.get_strv('open-selector')[0] ?? '';
            reset.visible = settings.get_user_value('open-selector') !== null;
        };
        reset.connect('clicked', () => {
            settings.reset('open-selector');
            refresh();
        });
        row.add_suffix(reset);
        row.connect('activated', () => this.recordShortcut(window, (accelerator) => {
            settings.set_strv('open-selector', accelerator ? [accelerator] : []);
            refresh();
        }));
        refresh();
        return row;
    }
    /** Captures the next key combination. Esc cancels; Backspace disables the shortcut. */
    recordShortcut(window, done) {
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
        keys.connect('key-pressed', (_controller, keyval, keycode, state) => {
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
            if (!Gtk.accelerator_valid(key, mask))
                return Gdk.EVENT_STOP;
            const functionKey = key >= Gdk.KEY_F1 && key <= Gdk.KEY_F35;
            if (mask === 0 && !functionKey) {
                hint.label = _('Use at least one modifier such as Super, Ctrl or Alt.');
                return Gdk.EVENT_STOP;
            }
            done(Gtk.accelerator_name_with_keycode(null, key, keycode, mask));
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keys);
        // Without this, GNOME Shell consumes combinations such as Super+Shift+Z itself.
        const surface = () => window.get_native()?.get_surface();
        dialog.connect('map', () => surface()?.inhibit_system_shortcuts?.(null));
        dialog.connect('closed', () => surface()?.restore_system_shortcuts?.());
        dialog.present(window);
    }
    gapRow(title, value, changed) {
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
    confirmDelete(window, name, confirmed) {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete profile?'),
            body: _(`“${name}” cannot be recovered.`),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.choose(window, null, (_dialog, result) => {
            if (dialog.choose_finish(result) === 'delete')
                confirmed();
        });
    }
    showRepairPage(window, settings, message) {
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
function previewZones(layout, area) {
    const rectangles = calculateZoneRectangles({ ...layout, outerGap: 0, innerGap: PREVIEW_GAP }, area, 'lenient');
    return layoutZones(layout).flatMap((zone) => {
        const rectangle = rectangles.get(zone.id);
        return rectangle ? [[zone, rectangle]] : [];
    });
}
function aspectOf(size) {
    return size.width / size.height;
}
function orientationLabel(orientation) {
    return orientation === 'portrait' ? _('Vertical') : _('Horizontal');
}
function resetRatios(layout, path = '') {
    const node = nodeAt(layout.root, path);
    if (node?.kind !== 'split')
        return;
    node.ratio = clampRatio(WEIGHT_TOTAL / 2);
    resetRatios(layout, `${path}0`);
    resetRatios(layout, `${path}1`);
}
function contains(rectangle, x, y) {
    return (x >= rectangle.x &&
        x < rectangle.x + rectangle.width &&
        y >= rectangle.y &&
        y < rectangle.y + rectangle.height);
}
function resizeCursor(axis) {
    return axis === 'horizontal' ? 'col-resize' : 'row-resize';
}
function randomId() {
    return GLib.uuid_string_random();
}
function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}
function capitalize(value) {
    return `${value[0].toUpperCase()}${value.slice(1)}`;
}
function inset(rectangle, amount) {
    return {
        x: rectangle.x + amount,
        y: rectangle.y + amount,
        width: rectangle.width - amount * 2,
        height: rectangle.height - amount * 2,
    };
}
function setColor(context, color, alpha) {
    context.setSourceRGBA(color.red, color.green, color.blue, color.alpha * alpha);
}
function roundedRectangle(context, rectangle, radius) {
    const { x, y, width, height } = rectangle;
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.newSubPath();
    context.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    context.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    context.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    context.arc(x + r, y + r, r, Math.PI, (Math.PI * 3) / 2);
    context.closePath();
}
