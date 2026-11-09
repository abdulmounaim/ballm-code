SHELL := /bin/bash
ROOT := $(shell cd .. && pwd)
BUN ?= bun

.PHONY: bootstrap dev backend test verify typecheck build-cli build-desktop sync release clean

bootstrap:
	cd $(ROOT) && $(BUN) install
	cd backend && $(BUN) install

dev:
	cd $(ROOT) && $(BUN) run dev

backend:
	cd backend && $(BUN) run dev

test:
	cd backend && $(BUN) test

typecheck:
	cd $(ROOT)/packages/core && $(BUN) typecheck

verify:
	./distro/scripts/verify.sh

build-cli:
	./distro/scripts/build-cli.sh

build-desktop:
	./distro/scripts/build-desktop.sh

sync:
	./distro/scripts/sync-upstream.sh

release:
	./distro/scripts/release.sh "$(TAG)"

clean:
	rm -rf backend/ballm.db backend/node_modules dist
