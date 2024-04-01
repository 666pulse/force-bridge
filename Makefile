local-ci: clean-dev-env install-node-modules github-ci

github-ci: build-bridge-lockscript start-docker
	cd offchain-modules && yarn integration

install-node-modules:
	cd offchain-modules && yarn --frozen-lockfile && yarn build
	cd eth-contracts && yarn --frozen-lockfile

start-docker:
	cd docker && docker-compose up -d

stop-docker:
	cd docker && docker-compose down

build-bridge-lockscript:
	cd bridge-lockscript && make build-release

deploy-eth-contracts:
	cd eth-contracts && yarn ci

clean-dev-env: stop-docker
	rm -rf workdir/integration
