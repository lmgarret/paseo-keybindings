// Shortcuts of Paseo's desktop menu (Electron accelerators), maintained by hand from Paseo's
// buildApplicationMenuTemplate. The plugin can neither run them nor change their keys, so the table
// lists them read-only. Behavior was observed in Paseo 0.17.3 on macOS: some keys never reach the
// page (`blocks`), the others reach it first, so a binding on them runs and the menu item does not.
// Linux and Windows are untested: only the zoom keys are listed there, as Paseo turns those off
// while recording a shortcut, which says the page cannot get them otherwise.

export interface MenuShortcut {
  /** Command column of the row; not a command the plugin can run. */
  id: string;
  label: string;
  /** Menu the item is in, shown in the row's note. */
  menu: string;
  /** Key on macOS and elsewhere, in this plugin's syntax; omitted when the item has none there (or untested). */
  mac?: string;
  other?: string;
  /** The menu takes the key before the page sees it: bindings on it never run. */
  blocks: boolean;
}

export const MENU_SHORTCUTS: readonly MenuShortcut[] = [
  { id: "menu.app.hide", label: "Hide Paseo", menu: "Paseo", mac: "cmd+h", blocks: true },
  { id: "menu.app.hideOthers", label: "Hide Others", menu: "Paseo", mac: "cmd+alt+h", blocks: true },
  { id: "menu.app.quit", label: "Quit Paseo", menu: "Paseo", mac: "cmd+q", blocks: true },
  { id: "menu.file.newWindow", label: "New Window", menu: "File", mac: "cmd+shift+n", blocks: false },
  { id: "menu.view.zoomIn", label: "Zoom In", menu: "View", mac: "cmd+=", other: "ctrl+=", blocks: true },
  { id: "menu.view.zoomOut", label: "Zoom Out", menu: "View", mac: "cmd+-", other: "ctrl+-", blocks: true },
  { id: "menu.view.actualSize", label: "Actual Size", menu: "View", mac: "cmd+0", other: "ctrl+0", blocks: true },
  { id: "menu.view.reload", label: "Reload", menu: "View", mac: "cmd+r", blocks: false },
  { id: "menu.view.forceReload", label: "Force Reload", menu: "View", mac: "cmd+shift+r", blocks: false },
  { id: "menu.view.toggleDevTools", label: "Toggle Developer Tools", menu: "View", mac: "cmd+alt+i", blocks: false },
  { id: "menu.view.toggleFullScreen", label: "Toggle Full Screen", menu: "View", mac: "ctrl+cmd+f", blocks: true },
  { id: "menu.window.minimize", label: "Minimize", menu: "Window", mac: "cmd+m", blocks: true },
];
