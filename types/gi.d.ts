declare module 'gi://*' {
  const value: any;
  export default value;
}

declare module 'resource://*' {
  export const Extension: any;
  export const ExtensionPreferences: any;
  export const gettext: (message: string) => string;
  const value: any;
  export default value;
}

declare module 'resource:///org/gnome/shell/ui/main.js' {
  export const panel: any;
  export const layoutManager: any;
  export const uiGroup: any;
  export const wm: any;
  export const notify: (title: string, body?: string) => void;
  export const notifyError: (title: string, body?: string) => void;
}

declare const global: any;

declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
  export const Button: any;
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
  export const PopupMenuItem: any;
  export const PopupSeparatorMenuItem: any;
}
