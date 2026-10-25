.PHONY: qa-runner-preflight qa qa-fast qa-pr qa-full

qa: qa-fast

qa-fast:
	pnpm migrations:check
	pnpm security:secrets
	pnpm lint
	pnpm test

qa-pr: qa-fast
	pnpm build

qa-full: qa-pr
	pnpm test:e2e

qa-runner-preflight:
	bash qa/runner-preflight.sh
