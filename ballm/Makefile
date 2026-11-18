SHELL := /bin/bash
ROOT := $(shell cd .. && pwd)
BUN ?= bun

.PHONY: bootstrap dev backend gateway console console-dev test typecheck verify icons brand-audit migrate keys compose-up compose-down build-cli build-desktop sync release clean

bootstrap:
	cd $(ROOT) && $(BUN) install
	cd backend && $(BUN) install
	cd backend/console && $(BUN) install
	cd distro && $(BUN) install

dev:
	cd $(ROOT) && $(BUN) run dev

backend:
	cd backend && $(BUN) run dev:control

gateway:
	cd backend && $(BUN) run dev:gateway

console:
	cd backend/console && $(BUN) run build

console-dev:
	cd backend/console && $(BUN) run dev

test:
	cd backend && $(BUN) run test

typecheck:
	cd $(ROOT)/packages/core && $(BUN) typecheck
	cd backend && $(BUN) run typecheck
	cd backend/console && $(BUN) run typecheck

verify:
	./distro/scripts/verify.sh

icons:
	cd distro && $(BUN) run icons

brand-audit:
	cd distro && $(BUN) run brand-audit

migrate:
	cd backend && $(BUN) run migrate

keys:
	cd backend && $(BUN) run keys

compose-up:
	cd backend && docker compose up --build

compose-down:
	cd backend && docker compose down

build-cli:
	./distro/scripts/build-cli.sh

build-desktop:
	./distro/scripts/build-desktop.sh

sync:
	./distro/scripts/sync-upstream.sh

release:
	./distro/scripts/release.sh "$(TAG)"

clean:
	rm -rf backend/secrets backend/node_modules backend/packages/platform/node_modules backend/services/*/node_modules backend/console/node_modules backend/console/dist distro/node_modules dist
