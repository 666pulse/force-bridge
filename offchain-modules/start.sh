export CONFIG_PATH="./config.json"
export FORCE_BRIDGE_KEYSTORE_PASSWORD="123456"

yarn build
ts-node ./packages/app-relayer/src/index.ts