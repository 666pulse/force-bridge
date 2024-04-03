import { Amount } from '@lay2/pw-core';
import { ChainType } from '../ckb/model/asset';
import { SolConfig, forceBridgeRole } from '../config';
import { getSolLockId } from '../db/entity/SolLock';
import { SolUnlock, SolUnlockStatus } from '../db/entity/SolUnlock';
import { SolDb } from '../db/sol';
import { asyncSleep } from '../utils';
import { logger } from '../utils/logger';
import { SolChain } from '../xchain/sol/solChain';
import { SolAssetAmount, getTxIdFromSerializedTx } from '../xchain/sol/utils';
const SolTokenAccount = 'solio.token';
const SolTokenTransferActionName = 'transfer';

export class SolLockEvent {
  TxHash: string;
  ActionIndex: number;
  BlockNumber: number;
  ActionPos: number;
  GlobalActionSeq: number;
  Asset: string;
  Precision: number;
  From: string;
  To: string;
  Amount: string;
  Memo: string;
}

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
    // this.signatureProvider = new JsSignatureProvider(this.config.privateKeys);
    this.chain = new SolChain(this.config.rpcUrl, {});
    this.assetPrecisionCache = new Map<string, number>();
  }

  setPrecision(symbol: string, precision: number): void {
    this.assetPrecisionCache.set(symbol, precision);
  }

  async getPrecision(symbol: string): Promise<number> {
    let precision = this.assetPrecisionCache.get(symbol);
    if (precision) {
      return precision;
    }
    precision = await this.chain.getCurrencyPrecision(symbol);
    this.setPrecision(symbol, precision!);
    return precision!;
  }

  async getUnlockRecords(status: SolUnlockStatus): Promise<SolUnlock[]> {
    return this.db.getSolUnlockRecordsToUnlock(status);
  }

  async buildUnlockTx(record: SolUnlock): Promise<any> {
    return (await this.chain.transfer(
      this.config.bridgerAccount,
      record.recipientAddress,
      this.config.bridgerAccountPermission,
      `${new Amount(record.amount, 0).toString(await this.getPrecision(record.asset))} ${record.asset}`,
      '',
      SolTokenAccount,
      {
        broadcast: false,
        blocksBehind: 3,
        expireSeconds: 30,
        sign: false,
      },
    ));
  }

  isLockAction(action: any): boolean {
    const actionTrace = action.action_trace;
    const act = actionTrace.act;
    if (act.account !== SolTokenAccount || act.name !== SolTokenTransferActionName) {
      return false;
    }
    const data = act.data;
    if (data.to !== this.config.bridgerAccount) {
      return false;
    }
    return true;
  }

  async processAction(pos: number, action: any): Promise<void> {
    const actionTrace = action.action_trace;
    const act = actionTrace.act;
    const data = act.data;
    const amountAsset = SolAssetAmount.assetAmountFromQuantity(data.quantity);
    this.setPrecision(amountAsset.Asset, amountAsset.Precision);
    const lockEvent = {
      TxHash: actionTrace.trx_id,
      ActionIndex: actionTrace.action_ordinal,
      BlockNumber: actionTrace.block_num,
      ActionPos: pos,
      GlobalActionSeq: action.global_action_seq,
      Asset: amountAsset.Asset,
      Precision: amountAsset.Precision,
      From: data.from,
      To: data.to,
      Amount: amountAsset.Amount,
      Memo: data.memo,
    };
    logger.info(
      `SolHandler watched transfer blockNumber:${actionTrace.block_num} globalActionSeq:${action.global_action_seq} txHash:${actionTrace.trx_id} from:${data.from} to:${data.to} amount:${lockEvent.Amount} asset:${lockEvent.Asset} memo:${data.memo}`,
    );
    try {
      await this.processLockEvent(lockEvent);
    } catch (err) {
      logger.error(
        `SolHandler process solLock event failed. blockNumber:${actionTrace.block_num} globalActionSeq:${action.global_action_seq} tx:${lockEvent.TxHash} from:${lockEvent.From} amount:${lockEvent.Amount} asset:${lockEvent.Asset} memo:${lockEvent.Memo} error:${err}.`,
      );
    }
  }

  async doWatchLockEventsInDescOrder(latestActionSeq: number): Promise<void> {
    let pos = 0;
    const offset = 20;
    while (true) {
      if (pos < 0) {
        pos = 0;
        await asyncSleep(3000);
      }

      let actions;
      try {
        actions = await this.chain.getActions(this.config.bridgerAccount, pos, offset);
      } catch (e) {
        logger.error(`SolHandler getActions pos:${pos} offset:${offset} error:${e}`);
        await asyncSleep(3000);
        continue;
      }

      const actLen = actions.actions.length;
      if (actLen === 0) {
        pos -= offset;
        continue;
      }

      const firstAction = actions.actions[0];
      if (latestActionSeq < 0) {
        //init
        latestActionSeq = firstAction.global_action_seq;
      }
      const lastAction = actions.actions[actLen - 1];
      if (lastAction.global_action_seq > latestActionSeq) {
        pos += offset;
        continue;
      }
      if (firstAction.global_action_seq < latestActionSeq) {
        pos -= offset;
        continue;
      }

      let hasReversibleAction = false;
      for (let i = actLen - 1; i >= 0; i--) {
        const action = actions.actions[i];
        if (action.global_action_seq <= latestActionSeq) {
          continue;
        }
        if (this.config.onlyWatchIrreversibleBlock && action.block_num > actions.last_irreversible_block) {
          hasReversibleAction = true;
          break;
        }
        latestActionSeq = action.global_action_seq;
        if (!this.isLockAction(action)) {
          continue;
        }
        await this.processAction(0, action); //don't need in desc order
      }
      if (hasReversibleAction) {
        //wait actions become irreversible
        await asyncSleep(3000);
      } else {
        pos -= offset;
      }
    }
  }

  async doWatchLockEventsInAscOrder(latestActionSeq: number): Promise<void> {
    const lastActionPos = await this.db.getActionPos(latestActionSeq);
    const offset = 20;
    let pos = lastActionPos;
    while (true) {
      let actions;
      try {
        actions = await this.chain.getActions(this.config.bridgerAccount, pos, offset);
      } catch (e) {
        logger.error(`SolHandler getActions pos:${pos} offset:${offset} error:${e}`);
        await asyncSleep(3000);
        continue;
      }

      const actLen = actions.actions.length;
      if (actLen === 0) {
        await asyncSleep(3000);
        continue;
      }

      let hasReversibleAction = false;
      for (let i = 0; i <= actLen - 1; i++) {
        const action = actions.actions[i];
        if (action.global_action_seq <= latestActionSeq) {
          continue;
        }
        if (this.config.onlyWatchIrreversibleBlock && action.block_num > actions.last_irreversible_block) {
          hasReversibleAction = true;
          break;
        }
        latestActionSeq = action.global_action_seq;
        if (!this.isLockAction(action)) {
          continue;
        }
        await this.processAction(pos + 1, action); //don't need in desc order
      }

      if (hasReversibleAction) {
        //wait actions become irreversible
        await asyncSleep(3000);
      } else {
        pos += actLen;
      }
    }
  }

  async watchLockEvents(): Promise<void> {
    //check chain id
    const curBlockInfo = await this.chain.getCurrentBlockInfo();
    if (curBlockInfo.chain_id != this.config.chainId) {
      logger.error(`SolHandler chainId:${curBlockInfo.chain_id} doesn't match with:${this.config.chainId}`);
      return;
    }

    while (true) {
      let actions;
      const pos = 0;
      const offset = 10;
      try {
        actions = await this.chain.getActions(this.config.bridgerAccount, pos, offset);
      } catch (e) {
        logger.error(`SolHandler getActions pos:${pos} offset:${offset} error:${e.toString()}`);
        await asyncSleep(3000);
      }
      const actLen = actions.actions.length;
      if (actLen === 0 || actLen === 1) {
        await asyncSleep(3000);
        continue;
      }

      let latestActionSeq = await this.db.getLastedGlobalActionSeq();
      if (latestActionSeq < this.config.latestGlobalActionSeq && this.config.latestGlobalActionSeq !== 0) {
        latestActionSeq = this.config.latestGlobalActionSeq;
      }

      //the order getAction is desc in jungle testnet, and asc in product env
      if (actions.actions[0].global_action_seq < actions.actions[actLen - 1].global_action_seq) {
        await this.doWatchLockEventsInAscOrder(latestActionSeq);
      } else {
        await this.doWatchLockEventsInDescOrder(latestActionSeq);
      }
      break;
    }
  }

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

    const fragments = lockRecord.memo.split(',');

    if (this.role !== 'collector') {
      return;
    }
    await this.db.createCkbMint([
      {
        id: lockRecord.id,
        chain: ChainType.SOL,
        amount: lockRecord.amount,
        asset: lockRecord.token,
        recipientLockscript: fragments[0] === undefined ? '0x' : fragments[0],
        sudtExtraData: fragments[1] === undefined ? '0x' : fragments[1],
      },
    ]);
    await this.db.createSolLock([lockRecord]);
    logger.info(
      `SolHandler process CkbMint successful for sol tx:${lockEvent.TxHash} from:${lockEvent.From} amount:${lockEvent.Amount} asset:${lockEvent.Asset} memo:${lockEvent.Memo}.`,
    );
  }

  async watchUnlockEvents(): Promise<void> {
    if (this.role !== 'collector') {
      return;
    }
    while (true) {
      try {
        const todoRecords = await this.getUnlockRecords('todo');
        if (todoRecords.length === 0) {
          await asyncSleep(15000);
          continue;
        }
        await this.processUnLockEvents(todoRecords);
      } catch (e) {
        logger.error('SolHandler watchUnlockEvents error:', e);
        await asyncSleep(3000);
      }
    }
  }

  async processUnLockEvents(records: SolUnlock[]): Promise<void> {
    for (const record of records) {
      logger.info(`SolHandler processUnLockEvents get new unlockEvent:${JSON.stringify(record, null, 2)}`);
      record.status = 'pending';
      const unlockTx = await this.buildUnlockTx(record);
      if (this.config.privateKeys.length === 0) {
        logger.error('Sol empty bridger account private keys');
        return;
      }
      const signatures: string[] = [];
      for (const pubKey of this.config.publicKeys) {
        // const signedTx = await this.signatureProvider.sign({
        //   chainId: this.config.chainId,
        //   requiredKeys: [pubKey],
        //   serializedTransaction: unlockTx.serializedTransaction,
        //   serializedContextFreeData: unlockTx.serializedContextFreeData,
        //   // TODO: why abis null here?
        //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //   // @ts-ignore
        //   abis: null,
        // });
        // signatures.push(signedTx.signatures[0]);
      }
      unlockTx.signatures = signatures;
      const txHash = getTxIdFromSerializedTx(unlockTx.serializedTransaction);
      record.solTxHash = txHash;
      await this.db.saveSolUnlock([record]); //save txHash first
      // let txRes: TransactResult | ReadOnlyTransactResult;
      // try {
      //   txRes = await this.chain.pushSignedTransaction(unlockTx);
      //   logger.info(
      //     `SolHandler pushSignedTransaction ckbTxHash:${record.ckbTxHash} receiver:${record.recipientAddress} solTxhash:${record.solTxHash} amount:${record.amount} asset:${record.asset}`,
      //   );
      //   if (!this.config.onlyWatchIrreversibleBlock) {
      //     // @ts-ignore
      //     const txStatus = txRes.processed.receipt!.status;
      //     if (txStatus === 'executed') {
      //       record.status = 'success';
      //     } else {
      //       record.status = 'error';
      //       record.message = `action status:${txStatus} doesn't executed`;
      //       logger.error(
      //         `SolHandler processUnLockEvents solTxHash:${txHash} ckbTxHash:${record.ckbTxHash} receiver:${record.recipientAddress} amount:${record.amount} asset:${record.asset} action status:${txStatus} doesn't executed`,
      //       );
      //     }
      //     await this.db.saveSolUnlock([record]);
      //   }
      // } catch (e) {
      //   record.status = 'error';
      //   record.message = e.message;
      //   logger.error(
      //     `SolHandler pushSignedTransaction failed solTxHash:${txHash} ckbTxHash:${record.ckbTxHash} receiver:${
      //       record.recipientAddress
      //     } amount:${record.amount} asset:${record.asset} error:${e.toString()}`,
      //   );
      //   await this.db.saveSolUnlock([record]);
      // }
    }
  }

  async checkUnlockTxStatus(): Promise<void> {
    if (this.role != 'collector') {
      return;
    }
    if (!this.config.onlyWatchIrreversibleBlock) {
      return;
    }

    while (true) {
      try {
        const pendingRecords = await this.getUnlockRecords('pending');
        if (pendingRecords.length === 0) {
          await asyncSleep(15000);
          continue;
        }
        const newRecords = new Array<SolUnlock>();
        for (const pendingRecord of pendingRecords) {
          const txRes = await this.chain.getTransaction(pendingRecord.solTxHash);
          // fixme: there is type error here, can not compile, should check again.
          if ('error' in txRes) {
            // const {
            //   error: { code, name, what },
            // } = txRes;
            pendingRecord.status = 'error';
            // pendingRecord.message = `rpcError ${code}-${name}:${what}`;
            pendingRecord.message = `rpcError: ${txRes}`;
            newRecords.push(pendingRecord);
            continue;
          }
          if (txRes.trx.receipt.status !== 'executed') {
            pendingRecord.status = 'error';
            pendingRecord.message = `invalid transaction result status:${txRes.trx.receipt.status}`;
            newRecords.push(pendingRecord);
            continue;
          }
          if (txRes.block_num <= txRes.last_irreversible_block) {
            pendingRecord.status = 'success';
            newRecords.push(pendingRecord);
            logger.info(
              `SolHandler unlock status check success. ckbTxHash:${pendingRecord.ckbTxHash} receiver:${pendingRecord.recipientAddress} solTxhash:${pendingRecord.solTxHash} amount:${pendingRecord.amount}, asset:${pendingRecord.asset}`,
            );
          }
        }
        if (newRecords.length !== 0) {
          await this.db.saveSolUnlock(newRecords);
        }
      } catch (e) {
        logger.error(`SolHandler checkUnlockTxStatus error:${e}`);
        await asyncSleep(3000);
      }
    }
  }

  start(): void {
    this.watchLockEvents().catch((err) => {
      logger.error(`SOLHandler watchLockEvents error:${err.stack}`);
    });
    this.watchUnlockEvents().catch((err) => {
      logger.error(`SOLHandler watchUnlockEvents error:${err.stack}`);
    });
    this.checkUnlockTxStatus().catch((err) => {
      logger.error(`SOLHandler checkUnlockTxStatus error:${err.stack}`);
    });
    logger.info('sol handler started  🚀');
  }
}
