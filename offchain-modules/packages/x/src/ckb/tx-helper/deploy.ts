import { Cell, HashType, OutPoint, Script } from '@ckb-lumos/base';
import { common } from '@ckb-lumos/common-scripts';
import { key } from '@ckb-lumos/hd';
import {
  generateSecp256k1Blake160Address,
  minimalCellCapacity,
  parseAddress,
  sealTransaction,
  TransactionSkeleton,
  TransactionSkeletonType,
} from '@ckb-lumos/helpers';
import * as utils from '@nervosnetwork/ckb-sdk-utils';
import { ConfigItem, MultisigItem } from '../../config';
import { asserts, nonNullable } from '../../errors';
import { blake2b, transactionSkeletonToJSON } from '../../utils';
import { logger } from '../../utils/logger';
import { CkbTxHelper } from './base_generator';
import { ScriptType } from './indexer';
import { getMultisigLock } from './multisig/multisig_helper';
import { generateTypeIDScript } from './multisig/typeid';

export interface ContractsBin {
  bridgeLockscript: Buffer;
  recipientTypescript: Buffer;
}

export interface ContractsConfig {
  bridgeLock: ConfigItem;
  recipientType: ConfigItem;
}

export interface OwnerCellConfig {
  multisigLockscript: Script;
  ownerCellTypescript: Script;
}

export interface UpgradeParams {
  typeidArgs: string;
  bin: Buffer;
}

export class CkbDeployManager extends CkbTxHelper {
  constructor(ckbRpcUrl: string, ckbIndexerUrl: string) {
    super(ckbRpcUrl, ckbIndexerUrl);
  }

  async deployContractWithTypeID(contract: Buffer, privateKey: string): Promise<ConfigItem> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    logger.debug(`txSkeleton: ${transactionSkeletonToJSON(txSkeleton)}`);

    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    const fromCells = await this.getFromCells(fromLockscript);
    if (fromCells.length === 0) {
      throw new Error('no available cells found');
    }
    const firstInputCell: Cell = nonNullable(fromCells[0]);
    txSkeleton = await common.setupInputCell(txSkeleton, firstInputCell);
    // setupInputCell will put an output same with input, clear it
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.clear();
    });
    // add output
    const firstInput = {
      previousOutput: firstInputCell.outPoint,
      since: '0x0',
    };
    const outputType = generateTypeIDScript(firstInput, `0x0`);
    const codeHash = utils.scriptToHash(<CKBComponents.Script>{
      codeHash: outputType.codeHash,
      hashType: outputType.hashType,
      args: outputType.args,
    });
    const scriptOutput: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: fromLockscript,
        type: outputType,
      },
      data: utils.bytesToHex(contract),
    };
    const scriptCapacity = minimalCellCapacity(scriptOutput);
    scriptOutput.cellOutput.capacity = `0x${scriptCapacity.toString(16)}`;

    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(scriptOutput);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress, fromCells.slice(1));
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    return {
      cellDep: {
        depType: 'code',
        outPoint: {
          txHash: hash,
          index: '0x0',
        },
      },
      script: {
        codeHash: codeHash,
        hashType: 'type',
      },
    };
  }

  async deployContracts(contracts: ContractsBin, privateKey: string): Promise<ContractsConfig> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    // logger.debug(`txSkeleton: ${transactionSkeletonToJSON(txSkeleton)}`);
    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));

    const fromLockscript = parseAddress(fromAddress);
    const fromCells = await this.getFromCells(fromLockscript);
    if (fromCells.length === 0) {
      throw new Error('no available cells found');
    }

    const firstInputCell: Cell = fromCells[0];
    txSkeleton = await common.setupInputCell(txSkeleton, firstInputCell);
    // setupInputCell will put an output same with input, clear it
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.clear();
    });

    // add output
    const firstInput = {
      previousOutput: firstInputCell.outPoint,
      since: '0x0',
    };
    const bridgeLockscriptOutputType = generateTypeIDScript(firstInput, `0x0`);
    const bridgeLockscriptCodeHash = utils.scriptToHash(<CKBComponents.Script>{
      codeHash: bridgeLockscriptOutputType.codeHash,
      hashType: bridgeLockscriptOutputType.hashType,
      args: bridgeLockscriptOutputType.args,
    });

    const bridgeLockscriptOutput: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: fromLockscript,
        type: bridgeLockscriptOutputType,
      },
      data: utils.bytesToHex(contracts.bridgeLockscript),
    };
    const bridgeLockscriptCapacity = minimalCellCapacity(bridgeLockscriptOutput);
    bridgeLockscriptOutput.cellOutput.capacity = `0x${bridgeLockscriptCapacity.toString(16)}`;

    const recipientTypescriptOutputType = generateTypeIDScript(firstInput, `0x1`);
    const recipientTypescriptCodeHash = utils.scriptToHash(<CKBComponents.Script>{
      codeHash: recipientTypescriptOutputType.codeHash,
      hashType: recipientTypescriptOutputType.hashType,
      args: recipientTypescriptOutputType.args,
    });
    const recipientTypescriptOutput: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: fromLockscript,
        type: recipientTypescriptOutputType,
      },
      data: utils.bytesToHex(contracts.recipientTypescript),
    };
    const recipientTypescriptCapacity = minimalCellCapacity(recipientTypescriptOutput);
    recipientTypescriptOutput.cellOutput.capacity = `0x${recipientTypescriptCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(bridgeLockscriptOutput).push(recipientTypescriptOutput);
    });

    txSkeleton = await this.completeTx(txSkeleton, fromAddress, fromCells.slice(1));
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    console.log(hash)

    return {
      bridgeLock: {
        cellDep: {
          depType: 'code',
          outPoint: {
            txHash: hash,
            index: '0x0',
          },
        },
        script: {
          codeHash: bridgeLockscriptCodeHash,
          hashType: 'type',
        },
      },
      recipientType: {
        cellDep: {
          depType: 'code',
          outPoint: {
            txHash: hash,
            index: '0x1',
          },
        },
        script: {
          codeHash: recipientTypescriptCodeHash,
          hashType: 'type',
        },
      },
    };
  }

  // should only be called in dev net
  async deploySudt(sudtBin: Buffer, privateKey: string): Promise<ConfigItem> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    // add output
    const sudtOutput: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: fromLockscript,
      },
      data: utils.bytesToHex(sudtBin),
    };
    const sudtCellCapacity = minimalCellCapacity(sudtOutput);
    sudtOutput.cellOutput.capacity = `0x${sudtCellCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(sudtOutput);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress);
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    const sudtCodeHash = utils.bytesToHex(blake2b(sudtBin));
    return {
      cellDep: {
        depType: 'code',
        outPoint: {
          txHash: hash,
          index: '0x0',
        },
      },
      script: {
        codeHash: sudtCodeHash,
        hashType: 'data',
      },
    };
  }

  // should only be called in dev net
  async deployContract(contractBin: Buffer, privateKey: string): Promise<ConfigItem> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });

    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);

    // add output
    const contractOutput: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: fromLockscript,
      },
      data: utils.bytesToHex(contractBin),
    };

    const contractCellCapacity = minimalCellCapacity(contractOutput);
    contractOutput.cellOutput.capacity = `0x${contractCellCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(contractOutput);
    });

    txSkeleton = await this.completeTx(txSkeleton, fromAddress);

    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    const contractCodeHash = utils.bytesToHex(blake2b(contractBin));
    return {
      cellDep: {
        depType: 'code',
        outPoint: {
          txHash: hash,
          index: '0x0',
        },
      },
      script: {
        codeHash: contractCodeHash,
        hashType: 'data',
      },
    };
  }

  async SignAndSendTransaction(txSkeleton: TransactionSkeletonType, privateKey: string): Promise<string> {
    txSkeleton = common.prepareSigningEntries(txSkeleton);
    const message = txSkeleton.get('signingEntries').get(0)!.message;
    const Sig = key.signRecoverable(message!, privateKey);
    const tx = sealTransaction(txSkeleton, [Sig]);
    const hash = await this.ckb.sendTransaction(tx, 'passthrough');
    await this.waitUntilCommitted(hash);
    return hash;
  }

  async createOwnerCell(
    multisigItem: MultisigItem,
    privateKey: string,
    multiCellXchainType: string,
  ): Promise<OwnerCellConfig> {
    await this.indexer.waitForSync();
    const multisigLockscript = getMultisigLock(multisigItem);
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    const fromCells = await this.getFromCells(fromLockscript);
    if (fromCells.length === 0) {
      throw new Error('no available cells found');
    }
    const firstInputCell: Cell = nonNullable(fromCells[0]);
    txSkeleton = await common.setupInputCell(txSkeleton, firstInputCell);
    // setupInputCell will put an output same with input, clear it
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.clear();
    });
    // add owner cell
    const firstInput = {
      previousOutput: firstInputCell.outPoint,
      since: '0x0',
    };
    const ownerCellTypescript = generateTypeIDScript(firstInput, `0x0`);
    const ownerCell: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: multisigLockscript,
        type: ownerCellTypescript,
      },
      data: '0x',
    };
    ownerCell.cellOutput.capacity = `0x${minimalCellCapacity(ownerCell).toString(16)}`;
    // create an empty cell for the multi sig
    const multiCell: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: multisigLockscript,
      },
      data: multiCellXchainType,
    };
    multiCell.cellOutput.capacity = `0x${minimalCellCapacity(multiCell).toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(ownerCell).push(multiCell);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress, fromCells.slice(1));
    const _hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    return {
      multisigLockscript,
      ownerCellTypescript,
    };
  }

  async upgradeCkbContract(upgrade: UpgradeParams[], privateKey: string): Promise<OutPoint[]> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    const typeidCodeHash = '0x00000000000000000000000000000000000000000000000000545950455f4944';
    for (const u of upgrade) {
      // get input
      const typeidScript = {
        codeHash: typeidCodeHash,
        hashType: 'type' as HashType,
        args: u.typeidArgs,
      };
      const searchKey = {
        script: {
          code_hash: typeidCodeHash,
          hash_type: 'type' as HashType,
          args: u.typeidArgs,
        },
        script_type: ScriptType.type,
      };
      const typeidInputs = await this.indexer.getCells(searchKey);
      asserts(typeidInputs.length === 1);
      txSkeleton = txSkeleton.update('inputs', (inputs) => {
        return inputs.concat(typeidInputs);
      });
      // add output
      const NewContractOutput: Cell = {
        cellOutput: {
          capacity: '0x0',
          lock: fromLockscript,
          type: typeidScript,
        },
        data: utils.bytesToHex(u.bin),
      };
      const sudtCellCapacity = minimalCellCapacity(NewContractOutput);
      NewContractOutput.cellOutput.capacity = `0x${sudtCellCapacity.toString(16)}`;
      txSkeleton = txSkeleton.update('outputs', (outputs) => {
        return outputs.push(NewContractOutput);
      });
    }
    txSkeleton = await this.completeTx(txSkeleton, fromAddress);
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    const outpoints = upgrade.map((_u, i) => {
      return {
        txHash: hash,
        index: '0x' + i.toString(16),
      };
    });
    return outpoints;
  }
}
