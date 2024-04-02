import { randomBytes } from "crypto";
import { key } from '@ckb-lumos/hd';
import { Script } from "@ckb-lumos/base";
import { hexify } from "@ckb-lumos/codec/lib/bytes";
import { getConfig } from "@ckb-lumos/config-manager";
import { generateSecp256k1Blake160Address } from '@ckb-lumos/helpers';
import { encodeToAddress } from "@ckb-lumos/helpers";
import { privateKeyToCkbPubkeyHash, privateKeyToCkbAddress } from '@force-bridge/x/dist/utils';
import { initLumosConfig } from '@force-bridge/x/dist/ckb/tx-helper/init_lumos_config';

import { pathFromProjectRoot } from './utils';

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


interface Account {
  lockScript: Script;
  address: string;
  pubKey: string;
  privKey: string;
}

const generateRandomPrivateKey = (): string => hexify(randomBytes(32));

const randomSecp256k1Account = (privKey?: string): Account => {
  const _privKey = (() => {
    if (privKey) {
      return privKey;
    }
    return generateRandomPrivateKey();
  })();

  const pubKey = key.privateToPublic(_privKey);
  const args = key.publicKeyToBlake160(pubKey);
  const template = getConfig().SCRIPTS["SECP256K1_BLAKE160"]!;
  const lockScript = {
    codeHash: template.CODE_HASH,
    hashType: template.HASH_TYPE,
    args: args,
  };

  const address = encodeToAddress(lockScript);

  return {
    lockScript,
    address,
    pubKey,
    privKey: _privKey,
  };
};

// run via docker
async function main() {
  const configPath = pathFromProjectRoot('tmp/dev-docker');
  console.log('configPath: ', configPath);
  const lumosConfigType = 'AGGRON4';

  initLumosConfig(lumosConfigType);

  const account = randomSecp256k1Account()
  const CKB_PRIVATE_KEY = account.privKey;

  console.log('CKB_PRIVATE_KEY ======> ', CKB_PRIVATE_KEY);
  console.log('privateKeyToCkbAddress(CKB_PRIVATE_KEY) ========> ', privateKeyToCkbAddress(CKB_PRIVATE_KEY));
  console.log('privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY) ========> ', privateKeyToCkbPubkeyHash(CKB_PRIVATE_KEY));
  const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(CKB_PRIVATE_KEY));
  console.log('Chain ckb address ========> ', fromAddress);

}

main();
