// hovering over the clock brings up the Alt-Tab task switcher
//
// Copyright 2010 Christian Schramm <christian.h.m.schramm@gmail.com>
// You might do anything you wish with this software, but don't sue me
// if something breaks.

const Shell = imports.gi.Shell;
const Gdk = imports.gi.Gdk;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const Lang = imports.lang;

const Main = imports.ui.main;
const AltTab = imports.ui.altTab;

_show_next = true;

function _showAltTabPopup () {   
    if (_show_next) {
        if (global.get_windows().length >= 3) {
            let tabPopup = new AltTab.AltTabPopup();
            tabPopup.show(true, true);
        }
    } else {
        _show_next = true;
    }
}

function main() {
    Main.panel._clockButton.connect('enter-event', _showAltTabPopup);
}

AppSwitcher = AltTab.AppSwitcher

// monkey-patching to get rid of the check if the alt-key is pressed

AltTab.AltTabPopup.prototype.show = function(backward, dont_check) {
    if (!dont_check)
        dont_check = false;
    let tracker = Shell.WindowTracker.get_default();
    let apps = tracker.get_running_apps ('');

    if (!apps.length)
        return false;

    if (!Main.pushModal(this.actor))
        return false;
    this._haveModal = true;

    this._keyPressEventId = global.stage.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
    this._keyReleaseEventId = global.stage.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));

    this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
    this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

    this._appSwitcher = new AppSwitcher(apps);
    this.actor.add_actor(this._appSwitcher.actor);
    this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
    this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

    this._appIcons = this._appSwitcher.icons;

    // Make the initial selection
    if (this._appIcons.length == 1) {
        if (!backward && this._appIcons[0].cachedWindows.length > 1) {
            // For compatibility with the multi-app case below
            this._select(0, 1, true);
        } else
            this._select(0);
    } else if (backward) {
        this._select(this._appIcons.length - 1);
    } else {
        let firstWindows = this._appIcons[0].cachedWindows;
        if (firstWindows.length > 1) {
            let curAppNextWindow = firstWindows[1];
            let nextAppWindow = this._appIcons[1].cachedWindows[0];

            // If the next window of the current app is more-recently-used
            // than the first window of the next app, then select it.
            if (curAppNextWindow.get_workspace() == global.screen.get_active_workspace() &&
                curAppNextWindow.get_user_time() > nextAppWindow.get_user_time())
                this._select(0, 1, true);
            else
                this._select(1);
        } else {
            this._select(1);
        }
    }
    let [x, y, mods] = global.get_pointer();
    if (!(mods & Gdk.ModifierType.MOD1_MASK) && !dont_check) {
        this._finish();
        return false;
    }
    return true;
}

// monkey-patching to avoid the task switcher popping up instantly after
// closing when the cursor is still over the clock.
AltTab.AltTabPopup.prototype._clickedOutside = function(actor, event) {
    [x, y] = Main.panel._clockButton.get_transformed_position();
    [sx, sy] = Main.panel._clockButton.get_size();
    [ex, ey] = event.get_coords();
    this.destroy();
    if (ex < x + sx && ex > x && ey < sy)
        _show_next = false;
}

AltTab.AltTabPopup.prototype._allocate = function (actor, box, flags) {
    let childBox = new Clutter.ActorBox();
    let focus = global.get_focus_monitor();

    let leftPadding = this.actor.get_theme_node().get_padding(St.Side.LEFT);
    let rightPadding = this.actor.get_theme_node().get_padding(St.Side.RIGHT);
    let bottomPadding = this.actor.get_theme_node().get_padding(St.Side.BOTTOM);
    let vPadding = this.actor.get_theme_node().get_vertical_padding();
    let hPadding = leftPadding + rightPadding;

    // Allocate the appSwitcher
    // We select a size based on an icon size that does not overflow the screen
    let [childMinHeight, childNaturalHeight] = this._appSwitcher.actor.get_preferred_height(focus.width - hPadding);
    let [childMinWidth, childNaturalWidth] = this._appSwitcher.actor.get_preferred_width(childNaturalHeight);
    childBox.x1 = Math.max(focus.x + leftPadding, focus.x + Math.floor((focus.width - childNaturalWidth) / 2));
    childBox.x2 = Math.min(childBox.x1 + focus.width - hPadding, childBox.x1 + childNaturalWidth);
    
    // this is patched to make the app switcher closer to the clock
    let [ex, ey, mods] = global.get_pointer();
    if (!(mods & Gdk.ModifierType.MOD1_MASK)) {
        // alt not pressed:
        [sx, sy] = Main.panel._clockButton.get_size();
        childBox.y1 = focus.y + sy;
    } else {
        childBox.y1 = focus.y + Math.floor((focus.height - childNaturalHeight) / 2);
    }
    childBox.y2 = childBox.y1 + childNaturalHeight;
    this._appSwitcher.actor.allocate(childBox, flags);

    // Allocate the thumbnails
    // We try to avoid overflowing the screen so we base the resulting size on
    // those calculations
    if (this._thumbnails) {
        let icon = this._appIcons[this._currentApp].actor;
        // Force a stage relayout to make sure we get the correct position
        global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, 0, 0);
        let [posX, posY] = icon.get_transformed_position();
        let thumbnailCenter = posX + icon.width / 2;
        let [childMinWidth, childNaturalWidth] = this._thumbnails.actor.get_preferred_width(-1);
        childBox.x1 = Math.max(focus.x + leftPadding, Math.floor(thumbnailCenter - childNaturalWidth / 2));
        if (childBox.x1 + childNaturalWidth > focus.x + focus.width - hPadding) {
            let offset = childBox.x1 + childNaturalWidth - focus.width + hPadding;
            childBox.x1 = Math.max(focus.x + leftPadding, childBox.x1 - offset - hPadding);
        }

        let [found, spacing] = this.actor.get_theme_node().get_length('spacing', false);
        if (!found)
            spacing = 0;

        childBox.x2 = childBox.x1 +  childNaturalWidth;
        if (childBox.x2 > focus.x + focus.width - rightPadding)
            childBox.x2 = focus.x + focus.width - rightPadding;
        childBox.y1 = this._appSwitcher.actor.allocation.y2 + spacing;
        this._thumbnails.addClones(focus.height - bottomPadding - childBox.y1);
        let [childMinHeight, childNaturalHeight] = this._thumbnails.actor.get_preferred_height(-1);
        childBox.y2 = childBox.y1 + childNaturalHeight;
        this._thumbnails.actor.allocate(childBox, flags);
    }
}

AltTab.AltTabPopup.prototype._init = function() {
    this.actor = new Shell.GenericContainer({ name: 'altTabPopup',
                                                reactive: true });

    this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
    this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
    this.actor.connect('allocate', Lang.bind(this, this._allocate));

    this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

    this._haveModal = false;

    this._currentApp = 0;
    this._currentWindow = -1;
    this._thumbnailTimeoutId = 0;
    this._motionTimeoutId = 0;

    // Initially disable hover so we ignore the enter-event if
    // the switcher appears underneath the current pointer location
    // patched to ignore that
    let [ex, ey, mods] = global.get_pointer();
    if (mods & Gdk.ModifierType.MOD1_MASK) {
        // alt pressed:
        this._disableHover();
    } else {
        this._mouseActive = true;
    }

    Main.uiGroup.add_actor(this.actor);
}

