import { Amount } from '@lay2/pw-core';
import { ChainType } from '../ckb/model/asset';
import { SolConfig, forceBridgeRole } from '../config';
import { getSolLockId } from '../db/entity/SolLock';
import { SolUnlock, SolUnlockStatus } from '../db/entity/SolUnlock';
import { SolDb } from '../db/sol';
import { asyncSleep } from '../utils';
import { logger } from '../utils/logger';
import { SolChain, SolLockEvent } from '../xchain/sol/solChain';
import { SolAssetAmount, getTxIdFromSerializedTx } from '../xchain/sol/utils';
import { TransactionResponse } from '@solana/web3.js';
const SolTokenAccount = 'solio.token';
const SolTokenTransferActionName = 'transfer';


export class SolHandler {
  private role: forceBridgeRole;
  private db: SolDb;
  private config: SolConfig;
  private chain: SolChain;
  // private readonly signatureProvider: JsSignatureProvider;
  private assetPrecisionCache: Map<string, number>;

  constructor(db: SolDb, config: SolConfig, role: forceBridgeRole) {
    this.role = role;
    this.db = db;
    this.config = config;
    this.chain = new SolChain(this.config.rpcUrl, this.config.contractAddress);
    this.assetPrecisionCache = new Map<string, number>();
  }

  setPrecision(symbol: string, precision: number): void {
    this.assetPrecisionCache.set(symbol, precision);
  }

  // async getPrecision(symbol: string): Promise<number> {
  //   let precision = this.assetPrecisionCache.get(symbol);
  //   if (precision) {
  //     return precision;
  //   }
  //   precision = await this.chain.getCurrencyPrecision(symbol);
  //   this.setPrecision(symbol, precision!);
  //   return precision!;
  // }

  // async getUnlockRecords(status: SolUnlockStatus): Promise<SolUnlock[]> {
  //   return this.db.getSolUnlockRecordsToUnlock(status);
  // }

  // async buildUnlockTx(record: SolUnlock): Promise<any> {
  //   return (await this.chain.transfer(
  //     this.config.bridgerAccount,
  //     record.recipientAddress,
  //     "",
  //     `${new Amount(record.amount, 0).toString(await this.getPrecision(record.asset))} ${record.asset}`,
  //     '',
  //     SolTokenAccount,
  //     {
  //       broadcast: false,
  //       blocksBehind: 3,
  //       expireSeconds: 30,
  //       sign: false,
  //     },
  //   ));
  // }

  isLockAction(action: SolLockEvent): boolean {
    return action.Type == "deposit";
  }

  // 监控锁仓事件
  async watchLockEvents(): Promise<void> {
    while (true) {
      let actions: { actions: any; lastTx: any; } = { actions: [], lastTx: "" };
      let txHash = ""
      const offset = 100;
      try {
        actions = await this.chain.getActions(txHash, offset);
      } catch (e) {
        logger.error(`SolHandler getActions error:${e.toString()}`);
        await asyncSleep(10000);
        continue;
      }
      const actLen = actions.actions.length;

      // 如果没有事件，则等待5秒后再次执行
      if (actLen === 0) {
        await asyncSleep(10000);
        continue;
      }

      txHash = actions.lastTx;

      // 判断事件是否是锁仓事件，如果是锁仓事件，跳转到执行mint
      for (let i = actLen - 1; i >= 0; i--) {
        const action = actions.actions[i];
        if (!this.isLockAction(action)) {
          continue;
        }
        await this.processLockEvent(action);
      }
      await asyncSleep(10000);
    }
  }

  // 记录数据到数据库，等待
  async processLockEvent(lockEvent: SolLockEvent): Promise<void> {
    const lockRecord = {
      id: getSolLockId(lockEvent.TxHash, lockEvent.ActionIndex),
      actionPos: lockEvent.ActionPos,
      globalActionSeq: lockEvent.GlobalActionSeq,
      txHash: lockEvent.TxHash,
      actionIndex: lockEvent.ActionIndex,
      amount: new Amount(lockEvent.Amount, lockEvent.Precision).toString(0),
      token: lockEvent.Asset,
      sender: lockEvent.From,
      memo: lockEvent.Memo,
      blockNumber: lockEvent.BlockNumber,
    };
    logger.info(
      `SolHandler process SolLock successful for sol tx:${lockEvent.TxHash} from:${lockEvent.From} amount:${lockEvent.Amount} asset:${lockEvent.Asset} memo:${lockEvent.Memo}.`,
    );

    if (this.role !== 'collector') {
      return;
    }

    await this.db.createCkbMint([
      {
        id: lockRecord.id,
        blockNumber: lockEvent.BlockNumber,
        chain: ChainType.SOL,
        amount: lockRecord.amount,
        asset: lockRecord.token,
        recipientLockscript: lockEvent.To,
        sudtExtraData: "",
      },
    ]);
    await this.db.createSolLock([lockRecord]);
    logger.info(
      `SolHandler process CkbMint successful for sol tx:${lockEvent.TxHash} from:${lockEvent.From} amount:${lockEvent.Amount} asset:${lockEvent.Asset} memo:${lockEvent.Memo}.`,
    );
  }

  // async watchUnlockEvents(): Promise<void> {
  //   if (this.role !== 'collector') {
  //     return;
  //   }
  //   while (true) {
  //     try {
  //       const todoRecords = await this.getUnlockRecords('todo');
  //       if (todoRecords.length === 0) {
  //         await asyncSleep(15000);
  //         continue;
  //       }
  //       await this.processUnLockEvents(todoRecords);
  //     } catch (e) {
  //       logger.error('SolHandler watchUnlockEvents error:', e);
  //       await asyncSleep(3000);
  //     }
  //   }
  // }

  // async processUnLockEvents(records: SolUnlock[]): Promise<void> {
  //   for (const record of records) {
  //     logger.info(`SolHandler processUnLockEvents get new unlockEvent:${JSON.stringify(record, null, 2)}`);
  //     record.status = 'pending';
  //     const unlockTx = await this.buildUnlockTx(record);
  //     if (this.config.privateKeys.length === 0) {
  //       logger.error('Sol empty bridger account private keys');
  //       return;
  //     }
  //     const signatures: string[] = [];
  //     for (const pubKey of this.config.publicKeys) {
  //       // const signedTx = await this.signatureProvider.sign({
  //       //   chainId: this.config.chainId,
  //       //   requiredKeys: [pubKey],
  //       //   serializedTransaction: unlockTx.serializedTransaction,
  //       //   serializedContextFreeData: unlockTx.serializedContextFreeData,
  //       //   // TODO: why abis null here?
  //       //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //       //   // @ts-ignore
  //       //   abis: null,
  //       // });
  //       // signatures.push(signedTx.signatures[0]);
  //     }
  //     unlockTx.signatures = signatures;
  //     const txHash = getTxIdFromSerializedTx(unlockTx.serializedTransaction);
  //     record.solTxHash = txHash;
  //     await this.db.saveSolUnlock([record]); //save txHash first
  //     // let txRes: TransactResult | ReadOnlyTransactResult;
  //     // try {
  //     //   txRes = await this.chain.pushSignedTransaction(unlockTx);
  //     //   logger.info(
  //     //     `SolHandler pushSignedTransaction ckbTxHash:${record.ckbTxHash} receiver:${record.recipientAddress} solTxhash:${record.solTxHash} amount:${record.amount} asset:${record.asset}`,
  //     //   );
  //     //   if (!this.config.onlyWatchIrreversibleBlock) {
  //     //     // @ts-ignore
  //     //     const txStatus = txRes.processed.receipt!.status;
  //     //     if (txStatus === 'executed') {
  //     //       record.status = 'success';
  //     //     } else {
  //     //       record.status = 'error';
  //     //       record.message = `action status:${txStatus} doesn't executed`;
  //     //       logger.error(
  //     //         `SolHandler processUnLockEvents solTxHash:${txHash} ckbTxHash:${record.ckbTxHash} receiver:${record.recipientAddress} amount:${record.amount} asset:${record.asset} action status:${txStatus} doesn't executed`,
  //     //       );
  //     //     }
  //     //     await this.db.saveSolUnlock([record]);
  //     //   }
  //     // } catch (e) {
  //     //   record.status = 'error';
  //     //   record.message = e.message;
  //     //   logger.error(
  //     //     `SolHandler pushSignedTransaction failed solTxHash:${txHash} ckbTxHash:${record.ckbTxHash} receiver:${
  //     //       record.recipientAddress
  //     //     } amount:${record.amount} asset:${record.asset} error:${e.toString()}`,
  //     //   );
  //     //   await this.db.saveSolUnlock([record]);
  //     // }
  //   }
  // }

  // async checkUnlockTxStatus(): Promise<void> {
  //   if (this.role != 'collector') {
  //     return;
  //   }

  //   while (true) {
  //     try {
  //       const pendingRecords = await this.getUnlockRecords('pending');
  //       if (pendingRecords.length === 0) {
  //         await asyncSleep(15000);
  //         continue;
  //       }
  //       const newRecords = new Array<SolUnlock>();
  //       for (const pendingRecord of pendingRecords) {
  //         const txRes = await this.chain.getTransaction(pendingRecord.solTxHash);
  //         // fixme: there is type error here, can not compile, should check again.
  //         if ('error' in txRes) {
  //           // const {
  //           //   error: { code, name, what },
  //           // } = txRes;
  //           pendingRecord.status = 'error';
  //           // pendingRecord.message = `rpcError ${code}-${name}:${what}`;
  //           pendingRecord.message = `rpcError: ${txRes}`;
  //           newRecords.push(pendingRecord);
  //           continue;
  //         }
  //         if (txRes.trx.receipt.status !== 'executed') {
  //           pendingRecord.status = 'error';
  //           pendingRecord.message = `invalid transaction result status:${txRes.trx.receipt.status}`;
  //           newRecords.push(pendingRecord);
  //           continue;
  //         }
  //         if (txRes.block_num <= txRes.last_irreversible_block) {
  //           pendingRecord.status = 'success';
  //           newRecords.push(pendingRecord);
  //           logger.info(
  //             `SolHandler unlock status check success. ckbTxHash:${pendingRecord.ckbTxHash} receiver:${pendingRecord.recipientAddress} solTxhash:${pendingRecord.solTxHash} amount:${pendingRecord.amount}, asset:${pendingRecord.asset}`,
  //           );
  //         }
  //       }
  //       if (newRecords.length !== 0) {
  //         await this.db.saveSolUnlock(newRecords);
  //       }
  //     } catch (e) {
  //       logger.error(`SolHandler checkUnlockTxStatus error:${e}`);
  //       await asyncSleep(3000);
  //     }
  //   }
  // }

  start(): void {
    this.watchLockEvents().catch((err) => {
      logger.error(`SOLHandler watchLockEvents error:${err.stack}`);
    });
    // this.watchUnlockEvents().catch((err) => {
    //   logger.error(`SOLHandler watchUnlockEvents error:${err.stack}`);
    // });
    // this.checkUnlockTxStatus().catch((err) => {
    //   logger.error(`SOLHandler checkUnlockTxStatus error:${err.stack}`);
    // });
    logger.info('sol handler started  🚀');
  }
}
