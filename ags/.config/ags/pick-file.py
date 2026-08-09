#!/usr/bin/env python3
import os
os.environ.setdefault("GTK_BACKEND", "wayland")
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk

dialog = Gtk.FileChooserDialog(
    title="Choose Wallpaper",
    action=Gtk.FileChooserAction.OPEN,
)
dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
dialog.add_button("Open", Gtk.ResponseType.ACCEPT)
response = dialog.run()
path = ""
if response == Gtk.ResponseType.ACCEPT:
    path = dialog.get_filename() or ""
dialog.destroy()
print(path)
