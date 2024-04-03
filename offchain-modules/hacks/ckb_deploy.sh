# get shell path
SOURCE="$0"
while [ -h "$SOURCE"  ]; do
    DIR="$( cd -P "$( dirname "$SOURCE"  )" && pwd  )"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /*  ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE"  )" && pwd  )"
cd $DIR/../

export CONFIG_PATH="./config.json"
export FORCE_BRIDGE_PROJECT_DIR="/home/wetee/work/wetee/force-bridge"
export FORCE_BRIDGE_KEYSTORE_PASSWORD="123456"

yarn build
ts-node ./packages/scripts/src/devDocker.ts