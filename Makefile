SHELL := /bin/bash

LIGHTSAIL_SCRIPT := infra/lightsail/deploy.sh
LIGHTSAIL_ENV ?= infra/lightsail/.env
LIGHTSAIL_FLAGS ?=
SERVICE ?= backend

.PHONY: lightsail-env lightsail-deploy lightsail-cleanup lightsail-cleanup-volumes lightsail-status lightsail-logs

lightsail-env:
	@if [ -f "$(LIGHTSAIL_ENV)" ]; then \
		echo "Using existing $(LIGHTSAIL_ENV)"; \
	else \
		cp infra/lightsail/.env.example "$(LIGHTSAIL_ENV)"; \
		echo "Created $(LIGHTSAIL_ENV) from template"; \
		echo "Edit secrets before running deployment."; \
	fi

lightsail-deploy: lightsail-env
	@"$(LIGHTSAIL_SCRIPT)" deploy --env-file "$(LIGHTSAIL_ENV)" $(LIGHTSAIL_FLAGS)

lightsail-cleanup: lightsail-env
	@"$(LIGHTSAIL_SCRIPT)" cleanup --env-file "$(LIGHTSAIL_ENV)" $(LIGHTSAIL_FLAGS)

lightsail-cleanup-volumes: lightsail-env
	@"$(LIGHTSAIL_SCRIPT)" cleanup --env-file "$(LIGHTSAIL_ENV)" --prune-volumes $(LIGHTSAIL_FLAGS)

lightsail-status: lightsail-env
	@"$(LIGHTSAIL_SCRIPT)" status --env-file "$(LIGHTSAIL_ENV)"

lightsail-logs: lightsail-env
	@SERVICE="$(SERVICE)" "$(LIGHTSAIL_SCRIPT)" logs --env-file "$(LIGHTSAIL_ENV)"
