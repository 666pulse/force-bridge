import assert from 'assert';
import { Account } from '@force-bridge/x/dist/ckb/model/accounts';
import { ChainType, SolAsset } from '@force-bridge/x/dist/ckb/model/asset';
import { IndexerCollector } from '@force-bridge/x/dist/ckb/tx-helper/collector';
import { CkbTxGenerator } from '@force-bridge/x/dist/ckb/tx-helper/generator';
import { CkbIndexer } from '@force-bridge/x/dist/ckb/tx-helper/indexer';
import { getMultisigLock } from '@force-bridge/x/dist/ckb/tx-helper/multisig/multisig_helper';
import { Config, SolConfig } from '@force-bridge/x/dist/config';
import { bootstrap, ForceBridgeCore } from '@force-bridge/x/dist/core';
import { CkbMint } from '@force-bridge/x/dist/db/entity/CkbMint';
import { SolLock, getSolLockId } from '@force-bridge/x/dist/db/entity/SolLock';
import { SolUnlock } from '@force-bridge/x/dist/db/entity/SolUnlock';
import { getDBConnection, parsePrivateKey } from '@force-bridge/x/dist/utils';
import { logger } from '@force-bridge/x/dist/utils/logger';
import { SolChain } from '@force-bridge/x/dist/xchain/sol/solChain';
import { Amount, Script } from '@lay2/pw-core';
import CKB from '@nervosnetwork/ckb-sdk-core';
import { JsSignatureProvider } from 'soljs/dist/soljs-jssig';
import nconf from 'nconf';
import { waitFnCompleted, waitUntilCommitted } from './util';

const CKB_URL = process.env.CKB_URL || 'http://127.0.0.1:8114';
const CKB_INDEXER_URL = process.env.CKB_INDEXER_URL || 'http://127.0.0.1:8116';
const indexer = new CkbIndexer(CKB_URL, CKB_INDEXER_URL);
const collector = new IndexerCollector(indexer);
const ckb = new CKB(CKB_URL);

async function main() {
  const configPath = process.env.CONFIG_PATH || './config.json';
  nconf.env().file({ file: configPath });
  const config: SolConfig = nconf.get('forceBridge:sol');
  const conf: Config = nconf.get('forceBridge');
  conf.common.log.logFile = './log/sol-ci.log';
  await bootstrap(conf);
  logger.debug('SolConfig:', config);

  const rpcUrl = config.rpcUrl;
  const PRI_KEY = parsePrivateKey(ForceBridgeCore.config.ckb.privateKey);
  const lockAccount = 'alice';
  const lockAccountPri = ['5KQG4541B1FtDC11gu3NrErWniqTaPHBpmikSztnX8m36sK5px5'];
  const chain = new SolChain(rpcUrl, new JsSignatureProvider(lockAccountPri));
  const conn = await getDBConnection();
  //lock sol
  const recipientLockscript = 'ckt1qyqyph8v9mclls35p6snlaxajeca97tc062sa5gahk';
  const memo = recipientLockscript;
  const lockAmount = '0.0001';
  const lockAsset = 'SOL';
  const solTokenAccount = 'solio.token';

  const lockTxRes = await chain.transfer(
    lockAccount,
    config.bridgerAccount,
    'active',
    `${lockAmount} ${lockAsset}`,
    memo,
    solTokenAccount,
    {
      broadcast: true,
      blocksBehind: 3,
      expireSeconds: 30,
    },
  );

  let lockTxHash: string;
  if ('transaction_id' in lockTxRes) {
    lockTxHash = lockTxRes.transaction_id;
    logger.debug(`SolLockTx:${lockTxRes}`);
  } else {
    throw new Error('send lock sol transaction failed. txRes:' + lockTxRes);
  }
  const transferActionId = getSolLockId(lockTxHash, 3); //index is 3 in sol local node

  //check SolLock and SolMint saved.
  const waitTimeout = 1000 * 60 * 5; //5 minutes
  await waitFnCompleted(
    waitTimeout,
    async (): Promise<boolean> => {
      const solLockRecords = await conn.manager.find(SolLock, {
        where: {
          id: transferActionId,
        },
      });
      const ckbMintRecords = await conn.manager.find(CkbMint, {
        where: {
          id: transferActionId,
        },
      });
      if (solLockRecords.length == 0 || ckbMintRecords.length === 0) {
        return false;
      }

      logger.info('SolLockRecords', solLockRecords);
      logger.info('CkbMintRecords', ckbMintRecords);

      assert(solLockRecords.length === 1);
      const solLockRecord = solLockRecords[0];
      assert(solLockRecord.amount === new Amount(lockAmount, 4).toString(0));
      assert(solLockRecord.token === lockAsset);
      assert(solLockRecord.memo === memo);
      assert(solLockRecord.sender === lockAccount);

      assert(ckbMintRecords.length === 1);
      const ckbMintRecord = ckbMintRecords[0];
      assert(ckbMintRecord.chain === ChainType.SOL);
      assert(ckbMintRecord.asset === lockAsset);
      assert(ckbMintRecord.amount === new Amount(lockAmount, 4).toString(0));
      assert(ckbMintRecord.recipientLockscript === recipientLockscript);
      return ckbMintRecord.status === 'success';
    },
    1000 * 10,
  );

  // check sudt balance.
  const account = new Account(PRI_KEY);
  const multisigLockScript = getMultisigLock(ForceBridgeCore.config.ckb.multisigScript);
  const ownLockHash = ckb.utils.scriptToHash(<CKBComponents.Script>{
    codeHash: multisigLockScript.codeHash,
    hashType: multisigLockScript.hashType,
    args: multisigLockScript.args,
  });
  const asset = new SolAsset(lockAsset, ownLockHash);
  const bridgeCellLockscript = {
    codeHash: ForceBridgeCore.config.ckb.deps.bridgeLock.script.codeHash,
    hashType: ForceBridgeCore.config.ckb.deps.bridgeLock.script.hashType,
    args: asset.toBridgeLockscriptArgs(),
  };
  const sudtArgs = ckb.utils.scriptToHash(<CKBComponents.Script>bridgeCellLockscript);
  const sudtType = {
    codeHash: ForceBridgeCore.config.ckb.deps.sudtType.script.codeHash,
    hashType: ForceBridgeCore.config.ckb.deps.sudtType.script.hashType,
    args: sudtArgs,
  };
  await waitFnCompleted(
    waitTimeout,
    async (): Promise<boolean> => {
      const balance = await collector.getSUDTBalance(
        new Script(sudtType.codeHash, sudtType.args, sudtType.hashType),
        await account.getLockscript(),
      );

      logger.info('sudt balance:', balance.toString(4));
      logger.info('expect balance:', new Amount(lockAmount, 4).toString(4));
      return balance.eq(new Amount(lockAmount, 4));
    },
    1000 * 10,
  );

  // send burn tx
  const burnAmount = new Amount('0.0001', 4);
  const generator = new CkbTxGenerator(ckb, indexer);
  const burnTx = await generator.burn(
    await account.getLockscript(),
    lockAccount,
    new SolAsset(lockAsset, ownLockHash),
    burnAmount,
  );
  const signedTx = ckb.signTransaction(PRI_KEY)(burnTx);
  const burnTxHash = await ckb.rpc.sendTransaction(signedTx);
  console.log(`burn Transaction has been sent with tx hash ${burnTxHash}`);
  await waitUntilCommitted(ckb, burnTxHash, 60);

  await waitFnCompleted(
    waitTimeout,
    async (): Promise<boolean> => {
      const balance = await collector.getSUDTBalance(
        new Script(sudtType.codeHash, sudtType.args, sudtType.hashType),
        await account.getLockscript(),
      );

      logger.info('sudt balance:', balance);
      logger.info('expect balance:', new Amount(lockAmount, 4).sub(burnAmount));
      return balance.eq(new Amount(lockAmount, 4).sub(burnAmount));
    },
    1000 * 10,
  );

  //check unlock record send
  let solUnlockTxHash = '';
  await waitFnCompleted(
    waitTimeout,
    async () => {
      const solUnlockRecords = await conn.manager.find(SolUnlock, {
        where: {
          ckbTxHash: burnTxHash,
          status: 'success',
        },
      });
      if (solUnlockRecords.length === 0) {
        return false;
      }
      logger.info('SolUnlockRecords', solUnlockRecords);
      assert(solUnlockRecords.length === 1);
      const solUnlockRecord = solUnlockRecords[0];
      assert(solUnlockRecord.recipientAddress == lockAccount);
      assert(solUnlockRecord.asset === lockAsset);
      logger.info('amount: ', solUnlockRecord.amount);
      logger.info('amount: ', burnAmount.toString(0));
      assert(solUnlockRecord.amount === burnAmount.toString(0));
      solUnlockTxHash = solUnlockRecord.solTxHash;
      return true;
    },
    1000 * 10,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
