import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as ExtensionUtils from "resource:///org/gnome/shell/misc/extensionUtils.js";

const FNLOCKED_ICON = "fnlk.svg";
const FNUNLOCKED_ICON = "fn.svg";
const NOFNLOCK_ICON = "none.svg";
const FN_LOCK_PATH = "/sys/devices/platform/tuxedo_keyboard/fn_lock";

export default class FnLockExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this._fileMonitor = null;
    this._timeout = null;
  }

  _readFnLockState() {
    try {
      return GLib.file_get_contents(FN_LOCK_PATH)[1].toString().trim();
    } catch (e) {
      console.error(`Error reading fn_lock state: ${e}`);
      return null;
    }
  }

  _writeFnLockState(state) {
    try {
      GLib.file_set_contents(FN_LOCK_PATH, state);
      return true;
    } catch (e) {
      console.error(`Error writing fn_lock state: ${e}`);
      return false;
    }
  }

  update_fnlock() {
    const state = this._readFnLockState();
    
    if (state === "1") {
      this._icon.set_gicon(this._gicon_locked);
    } else if (state === "0") {
      this._icon.set_gicon(this._gicon_unlocked);
    } else {
      this._icon.set_gicon(this._gicon_none);
    }
    
    // Log the current state for debugging
    console.log(`Current fn_lock state: ${state}`);
  }

  switch_fnlock() {
    const currentState = this._readFnLockState();
    if (currentState !== null) {
      const newState = currentState === "1" ? "0" : "1";
      if (this._writeFnLockState(newState)) {
        console.log(`Switched fn_lock state to: ${newState}`);
      }
    }
  }

  enable() {
    this._button = new PanelMenu.Button(0.0);
    this._icon = new St.Icon({ style_class: "system-status-icon" });
    this._gicon_locked = Gio.icon_new_for_string(
      `${this.path}/icons/${FNLOCKED_ICON}`
    );
    this._gicon_unlocked = Gio.icon_new_for_string(
      `${this.path}/icons/${FNUNLOCKED_ICON}`
    );
    this._gicon_none = Gio.icon_new_for_string(
      `${this.path}/icons/${NOFNLOCK_ICON}`
    );

    this.update_fnlock();

    this._button.add_child(this._icon);
    this._button.connect("button-press-event", () => {
      this.switch_fnlock();
      return Clutter.EVENT_STOP;
    });

    Main.panel.addToStatusArea("FnLock", this._button);

    this._settings = this.getSettings();
    Main.wm.addKeybinding(
      "keybinding",
      this._settings,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this.switch_fnlock()
    );

    // Set up file monitor
    const file = Gio.File.new_for_path(FN_LOCK_PATH);
    this._fileMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
    this._fileMonitor.connect("changed", () => {
      console.log("File monitor detected change");
      this.update_fnlock();
    });

    // Set up periodic checking
    this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
      this.update_fnlock();
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    Main.wm.removeKeybinding("keybinding");
    this._button?.destroy();
    this._button = null;
    this._icon?.destroy();
    this._icon = null;
    this._gicon_locked = null;
    this._gicon_unlocked = null;
    this._gicon_none = null;
    this._settings = null;

    if (this._fileMonitor) {
      this._fileMonitor.cancel();
      this._fileMonitor = null;
    }

    if (this._timeout) {
      GLib.source_remove(this._timeout);
      this._timeout = null;
    }
  }
}
