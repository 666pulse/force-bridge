# get shell path
SOURCE="$0"
while [ -h "$SOURCE"  ]; do
    DIR="$( cd -P "$( dirname "$SOURCE"  )" && pwd  )"
    SOURCE="$(readlink "$SOURCE")"
    [[ $SOURCE != /*  ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE"  )" && pwd  )"
cd $DIR/../

export FORCE_BRIDGE_KEYSTORE_PASSWORD="123456"

ts-node ./packages/app-cli/src/index.ts verifier -cfg tmp/dev-docker/verifier1/force_bridge.json