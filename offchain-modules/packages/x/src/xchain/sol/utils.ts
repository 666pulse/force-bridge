import { Buffer } from 'buffer';
// import { sha256 } from 'soljs/dist/soljs-key-conversions';
import { asserts } from '../../errors';

export class SolAssetAmount {
  Amount: string;
  Asset: string;
  Precision: number;
  constructor(amount: string, asset: string, precision = 4) {
    this.Amount = amount;
    this.Asset = asset;
    this.Precision = precision;
  }

  static assetAmountFromQuantity(quantity: string): SolAssetAmount {
    //parse quantity "1.0000 SOL" to "1.0000" and "SOL"
    const res = quantity.match(/^(\d+\.\d+)\s*(\w+)?$/i);

    asserts(res);
    return new SolAssetAmount(res[1], res[2], getPrecisionFromAmount(res[1]));
  }

  toString(): string {
    return `${this.Amount} ${this.Asset}`;
  }
}

export function getTxIdFromSerializedTx(serializedTx: Uint8Array): string {
  const buf = Buffer.from(serializedTx);
  // return Buffer.from(sha256(buf)).toString('hex');
  return ""
}

export function getPrecisionFromAmount(amount: string): number {
  amount = amount.trim();
  const index = amount.indexOf('.');
  return amount.length - index - 1;
}
