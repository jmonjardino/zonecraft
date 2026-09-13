UUID := zonecraft@jmonjardino.dev
SCHEMA := schemas/org.gnome.shell.extensions.zonecraft.gschema.xml
RELEASE_DIR := build/releases
PACKAGE := $(RELEASE_DIR)/$(UUID).shell-extension.zip

.PHONY: all check test pack install clean

all:
	npm run build

check:
	npm run check

test:
	npm test

pack: all
	mkdir -p $(RELEASE_DIR)
	gnome-extensions pack --force --out-dir=$(RELEASE_DIR) --schema=$(SCHEMA) \
		--extra-source=core --extra-source=runtime --extra-source=ui dist

install: pack
	gnome-extensions install --force $(PACKAGE)

clean:
	rm -rf dist build coverage
