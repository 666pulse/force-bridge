import { TextDecoder, TextEncoder } from 'util';
// import { Api, JsonRpc } from 'soljs';
// import { SignatureProvider, TransactConfig, Transaction, TransactResult } from 'soljs/dist/soljs-api-interfaces';
// import {
//   GetAccountResult,
//   GetActionsResult,
//   GetBlockResult,
//   GetCurrencyStatsResult,
//   GetInfoResult,
//   GetTransactionResult,
//   PushTransactionArgs,
//   ReadOnlyTransactResult,
// } from 'soljs/dist/soljs-rpc-interfaces';
import fetch from 'node-fetch/index';
import { SolAssetAmount } from './utils';

export class SolChain {
  // private readonly rpc: JsonRpc;
  // private readonly signatureProvider: SignatureProvider;
  // private readonly api: Api;

  constructor(rpcUrl: string, signatureProvider:any) {
    // this.rpc = new JsonRpc(rpcUrl, { fetch });
    // this.signatureProvider = signatureProvider;
    // this.api = new Api({
    //   rpc: this.rpc,
    //   signatureProvider: signatureProvider,
    //   textDecoder: new TextDecoder() as Api['textDecoder'],
    //   textEncoder: new TextEncoder(),
    // });
  }

  getCurrentBlockInfo(): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  getBlock(blockNumberOrId: number | string): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  getAccountInfo(account: string): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  transact(transaction: any, transactCfg?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  getCurrencyStats(symbol: string, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  getCurrencyBalance(account: string, symbol: string, code = 'solio.token'): Promise<string[]> {
    return new Promise((resolve, reject) => {
      resolve([]);
    });
  }

  async getCurrencyPrecision(symbol: string, code = 'solio.token'): Promise<number> {
    const stats = await this.getCurrencyStats(symbol, code);
    const assetAmount = SolAssetAmount.assetAmountFromQuantity(stats[symbol].supply);
    return assetAmount.Precision;
  }

  async transfer(
    from: string,
    to: string,
    fromPermission: string,
    quantity: string,
    memo: string,
    tokenAccount = 'solio.token',
    transactCfg?: any,
  ): Promise<any> {
    return {}
  }

  pushSignedTransaction({
    signatures,
    serializedTransaction,
    serializedContextFreeData,
  }: any): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });;
  }

  //getActions actions ordered by desc related with account，bound:[pos, pos+offset]
  getActions(account: string, pos: number, offset?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }

  getTransaction(txHash: string): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }
}
