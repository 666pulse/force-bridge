import fs from 'fs';
import path from 'path';
import { key } from '@ckb-lumos/hd';
import { generateSecp256k1Blake160Address } from '@ckb-lumos/helpers';
import { OwnerCellConfig } from '@force-bridge/x/dist/ckb/tx-helper/deploy';
import { Config, WhiteListEthAsset, CkbDeps } from '@force-bridge/x/dist/config';
import { privateKeyToCkbPubkeyHash, privateKeyToCkbAddress, writeJsonToFile } from '@force-bridge/x/dist/utils';
import { logger, initLog } from '@force-bridge/x/dist/utils/logger';
import { KeyStore } from '@force-bridge/keystore/dist';
import { initLumosConfig } from '@force-bridge/x/dist/ckb/tx-helper/init_lumos_config';

import lodash from 'lodash';
import * as Mustache from 'mustache';
import { pathFromProjectRoot } from './utils';
import { deployDev } from './utils/deploy';
import { nonNullable } from '@force-bridge/x';

export interface VerifierConfig {
  privkey: string;
  ckbAddress: string;
  ckbPubkeyHash: string;
  ethAddress: string;
}

export interface MultisigConfig {
  threshold: number;
  verifiers: VerifierConfig[];
}

// run via docker
async function main() {
  nonNullable(process.env.FORCE_BRIDGE_PROJECT_DIR);
  initLog({ level: 'debug', identity: 'dev-docker' });
  // used for deploy and run service
  const ETH_PRIVATE_KEY = '0xc4ad657963930fbff2e9de3404b30a4e21432c89952ed430b56bf802945ed37a';
  const CKB_PRIVATE_KEY = "0x52e9814fe02dad3b8299dbf3c30dc94b4d822ecf9ff00e6bd64d0c5fba771faf";

  const MULTISIG_NUMBER = 1;
  const MULTISIG_THRESHOLD = 1;
  const FORCE_BRIDGE_KEYSTORE_PASSWORD = '123456';
  // connect to docker network: docker_force-dev-net
  const ETH_RPC_URL = 'http://127.0.0.1:8545';
  const CKB_RPC_URL = 'https://testnet.ckb.dev/rpc';
  const CKB_INDEXER_URL = 'https://testnet.ckb.dev/indexer';

  const configPath = pathFromProjectRoot('/offchain-modules/tmp/dev-docker');
  console.log('configPath: ', configPath);
  const lumosConfigType = 'AGGRON4';

  const initConfig = {
    common: {
      log: {
        level: 'info',
        logFile: '/data/force_bridge.log',
      },
      lumosConfigType: lumosConfigType,
      network: 'testnet',
      role: 'watcher',
      orm: {
        type: 'mysql',
        host: 'db',
        port: 3306,
        username: 'root',
        password: 'root',
        database: 'forcebridge',
        timezone: 'Z',
        synchronize: true,
        logging: false,
      },
      openMetric: true,
      collectorPubKeyHash: [],
      port: 80,
    },
    eth: {
      rpcUrl: ETH_RPC_URL,
      confirmNumber: 12,
      startBlockHeight: 1,
    },
    ckb: {
      ckbRpcUrl: CKB_RPC_URL,
      ckbIndexerUrl: CKB_INDEXER_URL,
      startBlockHeight: 1,
      confirmNumber: 15,
      sudtSize: 500,
    },
  };

  initLumosConfig(lumosConfigType);

  console.log('CKB_PRIVATE_KEY ======> ', CKB_PRIVATE_KEY);
  console.log('privateKeyToCkbAddress(CKB_PRIVATE_KEY) ========> ', privateKeyToCkbAddress(CKB_PRIVATE_KEY));
  console.log('privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY) ========> ', privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY));
  const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(CKB_PRIVATE_KEY));
  console.log('Chain ckb address ========> ', fromAddress);

  const { assetWhiteList, ckbDeps, ownerConfig, bridgeEthAddress, multisigConfig, ckbStartHeight, ethStartHeight } =
    await deployDev(
      ETH_RPC_URL,
      CKB_RPC_URL,
      CKB_INDEXER_URL,
      MULTISIG_NUMBER,
      MULTISIG_THRESHOLD,
      ETH_PRIVATE_KEY,
      CKB_PRIVATE_KEY,
      lumosConfigType,
      '0x01',
      path.join(configPath, 'deployConfig.json'),
    );

  await generateConfig(
    initConfig as unknown as Config,
    assetWhiteList,
    ckbDeps,
    ownerConfig,
    bridgeEthAddress,
    multisigConfig,
    ckbStartHeight,
    ethStartHeight,
    configPath,
    ETH_PRIVATE_KEY,
    CKB_PRIVATE_KEY,
    FORCE_BRIDGE_KEYSTORE_PASSWORD,
  );

  const verifiers = lodash.range(MULTISIG_NUMBER).map((i) => {
    return {
      name: `verifier${i + 1}`,
      db_port: 3200 + i,
      port: 3100 + i,
    };
  });

  const dockerComposeFile = Mustache.render(dockerComposeTemplate, {
    FORCE_BRIDGE_KEYSTORE_PASSWORD,
    network: 'host',
    projectDir: process.env.FORCE_BRIDGE_PROJECT_DIR,
    verifiers,
  });

  fs.writeFileSync(path.join(configPath, 'docker-compose.yml'), dockerComposeFile);
}

main();

async function generateConfig(
  initConfig: Config,
  assetWhiteList: WhiteListEthAsset[],
  ckbDeps: CkbDeps,
  ownerCellConfig: OwnerCellConfig,
  ethContractAddress: string,
  multisigConfig: MultisigConfig,
  ckbStartHeight: number,
  ethStartHeight: number,
  configPath: string,
  ETH_PRIVATE_KEY: string,
  CKB_PRIVATE_KEY: string,
  password,
) {
  const baseConfig: Config = lodash.cloneDeep(initConfig);
  // logger.debug(`baseConfig: ${JSON.stringify(baseConfig, null, 2)}`);
  baseConfig.eth.assetWhiteList = assetWhiteList;
  baseConfig.eth.contractAddress = ethContractAddress;
  baseConfig.ckb.deps = ckbDeps;
  baseConfig.ckb.startBlockHeight = ckbStartHeight;
  baseConfig.eth.startBlockHeight = ethStartHeight;
  baseConfig.ckb.ownerCellTypescript = ownerCellConfig.ownerCellTypescript;
  
  // collector
  const collectorConfig: Config = lodash.cloneDeep(baseConfig);
  collectorConfig.common.role = 'collector';
  collectorConfig.common.log.level = 'debug';
  collectorConfig.common.orm!.host = 'collector_db';
  collectorConfig.common.collectorPubKeyHash.push(privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY));
  collectorConfig.eth.privateKey = 'eth';
  collectorConfig.ckb.privateKey = 'ckb';
  collectorConfig.eth.multiSignThreshold = multisigConfig.threshold;
  collectorConfig.eth.multiSignAddresses = multisigConfig.verifiers.map((v) => v.ethAddress);
  collectorConfig.common.keystorePath = '/data/keystore.json';
  collectorConfig.ckb.multisigScript = {
    R: 0,
    M: multisigConfig.threshold,
    publicKeyHashes: multisigConfig.verifiers.map((v) => v.ckbPubkeyHash),
  };
  collectorConfig.collector = {
    gasLimit: 250000,
    batchGasLimit: 100000,
    gasPriceGweiLimit: 100,
    multiCellXchainType: '0x01',
  };
  collectorConfig.eth.multiSignHosts = multisigConfig.verifiers.map((v, i) => {
    return {
      address: v.ethAddress,
      host: `http://verifier${i + 1}/force-bridge/sign-server/api/v1`,
    };
  });
  collectorConfig.ckb.multiSignHosts = multisigConfig.verifiers.map((v, i) => {
    return {
      address: v.ckbAddress,
      host: `http://verifier${i + 1}/force-bridge/sign-server/api/v1`,
    };
  });
  const collectorStore = KeyStore.createFromPairs(
    {
      ckb: CKB_PRIVATE_KEY,
      eth: ETH_PRIVATE_KEY,
    },
    password,
  ).getEncryptedData();
  const collectorKeystorePath = path.join(configPath, 'collector/keystore.json');
  writeJsonToFile(collectorStore, collectorKeystorePath);
  writeJsonToFile({ forceBridge: collectorConfig }, path.join(configPath, 'collector/force_bridge.json'));
 
  // watcher
  const watcherConfig: Config = lodash.cloneDeep(baseConfig);
  watcherConfig.common.role = 'watcher';
  watcherConfig.common.orm!.host = 'watcher_db';
  writeJsonToFile({ forceBridge: watcherConfig }, path.join(configPath, 'watcher/force_bridge.json'));
  
  // verifiers
  multisigConfig.verifiers.map((v, i) => {
    const verifierIndex = i + 1;
    const verifierConfig: Config = lodash.cloneDeep(baseConfig);
    verifierConfig.common.role = 'verifier';
    verifierConfig.common.orm!.host = `verifier${verifierIndex}_db`;
    verifierConfig.eth.privateKey = 'verifier';
    verifierConfig.ckb.privateKey = 'verifier';
    verifierConfig.common.collectorPubKeyHash.push(privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY));
    verifierConfig.common.keystorePath = '/data/keystore.json';
    const verifierStore = KeyStore.createFromPairs(
      {
        verifier: v.privkey,
      },
      password,
    ).getEncryptedData();
    const verifierKeystorePath = path.join(configPath, `verifier${verifierIndex}/keystore.json`);
    writeJsonToFile(verifierStore, verifierKeystorePath);
    writeJsonToFile(
      { forceBridge: verifierConfig },
      path.join(configPath, `verifier${verifierIndex}/force_bridge.json`),
    );
  });
  // docker compose file
}

const dockerComposeTemplate = `
version: "3.3"
services:
  script:
    image: node:16.20.2-bullseye
    restart: on-failure
    volumes:
      - ./script:/data
      - {{&projectDir}}:/app
    environment:
      DOTENV_PATH: /data/.env
      LOG_PATH: /data/script.log
    command: |
      sh -c '
      cp /app/workdir/testnet-docker/.env.tx_sender /data/.env
      cd /app/offchain-modules;
      yarn startTxSender
      '
  watcher_db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: forcebridge
    ports:
      - 3050:3306
  watcher:
    image: node:16.20.2-bullseye
    restart: on-failure
    environment:
      FORCE_BRIDGE_KEYSTORE_PASSWORD: {{FORCE_BRIDGE_KEYSTORE_PASSWORD}}
    volumes:
      - {{&projectDir}}:/app
      - ./watcher:/data
    ports:
      - "3060:80"
    command: |
      sh -c '
      cd /app/offchain-modules;
      npx ts-node ./packages/app-cli/src/index.ts rpc -cfg /data/force_bridge.json
      '
    depends_on:
      - watcher_db
  collector_db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: forcebridge
    ports:
      - 3059:3306
  collector:
    image: node:16.20.2-bullseye
    restart: on-failure
    environment:
      FORCE_BRIDGE_KEYSTORE_PASSWORD: {{FORCE_BRIDGE_KEYSTORE_PASSWORD}}
    volumes:
      - {{&projectDir}}:/app
      - ./collector:/data
    ports:
      - "3069:80"
    command: |
      sh -c '
      cd /app/offchain-modules;
      npx ts-node ./packages/app-cli/src/index.ts collector -cfg /data/force_bridge.json
      '
    depends_on:
      - collector_db
{{#verifiers}}      
  {{name}}_db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: forcebridge
    ports:
      - {{db_port}}:3306
  {{name}}:
    image: node:16.20.2-bullseye
    restart: on-failure
    environment:
      FORCE_BRIDGE_KEYSTORE_PASSWORD: {{FORCE_BRIDGE_KEYSTORE_PASSWORD}}
    volumes:
      - {{&projectDir}}:/app
      - ./{{name}}:/data
    ports:
      - {{port}}:80
    command: |
      sh -c '
      cd /app/offchain-modules;
      npx ts-node ./packages/app-cli/src/index.ts verifier -cfg /data/force_bridge.json
      '
    depends_on:
      - {{name}}_db
{{/verifiers}}
  monitor_db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: forcebridge
    ports:
      - 3064:3306
  monitor:
    image: node:16.20.2-bullseye
    restart: on-failure
    environment:
      MONITOR_DURATION_CONFIG_PATH: /data/monitor.json
    volumes:
      - {{&projectDir}}:/app
      - ./monitor:/data
    command: |
      sh -c '
      cd /app/offchain-modules;
      npx ts-node ./packages/app-cli/src/index.ts monitor -cfg /data/force_bridge.json
      '
    depends_on:
      - monitor_db
`;
