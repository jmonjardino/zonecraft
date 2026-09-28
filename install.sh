#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Install Zonecraft for the current user from a clone of this repository.
# The compiled extension is committed in dist/, so Node.js is not needed.
#
#   ./install.sh              install (or update) and enable Zonecraft
#   ./install.sh --uninstall  remove Zonecraft

set -euo pipefail

UUID='zonecraft@jmonjardino.dev'
SCHEMA='schemas/org.gnome.shell.extensions.zonecraft.gschema.xml'
SUPPORTED='49 50 51'

cd "$(dirname "$0")"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

command -v gnome-extensions >/dev/null || fail 'gnome-extensions was not found. Zonecraft needs GNOME Shell.'
command -v gsettings >/dev/null || fail 'gsettings was not found.'

enabled_list() { gsettings get org.gnome.shell enabled-extensions; }

if [[ ${1:-} == '--uninstall' ]]; then
  # `gnome-extensions uninstall` needs a running Shell; remove the files directly.
  rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
  list=$(enabled_list)
  if [[ $list == *"'$UUID'"* ]]; then
    list=${list//", '$UUID'"/}
    list=${list//"'$UUID', "/}
    list=${list//"'$UUID'"/}
    gsettings set org.gnome.shell enabled-extensions "$list"
  fi
  say 'Zonecraft was removed. Log out and back in to unload it.'
  exit 0
fi

[[ -f dist/metadata.json ]] || fail 'dist/ is missing. Run "npm ci && npm run build" first.'

version=$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)
if [[ -n $version && " $SUPPORTED " != *" $version "* ]]; then
  fail "GNOME Shell $version is not supported. Zonecraft supports GNOME Shell ${SUPPORTED// /, }."
fi
if [[ ${XDG_SESSION_TYPE:-wayland} != 'wayland' ]]; then
  printf 'Warning: Zonecraft is tested on Wayland only; this session is %s.\n' "$XDG_SESSION_TYPE" >&2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

gnome-extensions pack --force --out-dir="$tmp" --schema="$SCHEMA" \
  --extra-source=core --extra-source=runtime --extra-source=ui dist >/dev/null
gnome-extensions install --force "$tmp/$UUID.shell-extension.zip"

# A new extension is only loaded by GNOME Shell after logging in again on
# Wayland, so `gnome-extensions enable` cannot see it yet. Adding it to the
# enabled list makes it start on the next login.
list=$(enabled_list)
if [[ $list != *"'$UUID'"* ]]; then
  if [[ $list == '@as []' || $list == '[]' ]]; then
    list="['$UUID']"
  else
    list="${list%]}, '$UUID']"
  fi
  gsettings set org.gnome.shell enabled-extensions "$list"
fi

if [[ $(gsettings get org.gnome.shell disable-user-extensions) == 'true' ]]; then
  printf 'Warning: user extensions are turned off. Turn them on in the Extensions app.\n' >&2
fi

say 'Zonecraft is installed and enabled.'
echo 'Log out and back in, then press Super+Shift+Z or use the grid icon in the top bar.'
