// hovering over the clock brings up the Alt-Tab task switcher
//
// Copyright 2010 Christian Schramm <christian.h.m.schramm@gmail.com>
// You might do anything you wish with this software, but don't sue me
// if something breaks.

const Shell = imports.gi.Shell;
const Gdk = imports.gi.Gdk;

const Lang = imports.lang;

const Main = imports.ui.main;
const AltTab = imports.ui.altTab;

_show_next = true;

function _showAltTabPopup () {   
    if (_show_next) {
        let tabPopup = new AltTab.AltTabPopup();
        tabPopup.show(true, true);
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
