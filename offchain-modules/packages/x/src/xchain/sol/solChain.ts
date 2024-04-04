import { Connection, PublicKey, SignaturesForAddressOptions, TransactionResponse } from '@solana/web3.js';
import { SolAssetAmount } from './utils';
import { BigNumber } from 'bignumber.js';
import { BorshCoder, Idl } from '@coral-xyz/anchor';

export class SolLockEvent {
  Type!: string;
  TxHash!: string;
  ActionIndex!: number;
  BlockNumber!: number;
  ActionPos!: number;
  GlobalActionSeq!: number;
  Asset!: string;
  Precision!: number;
  From!: string;
  To!: string;
  Amount!: string;
  Memo!: string;
}

export class SolChain {
  private readonly connection: Connection;
  private readonly contractAddress: string;

  constructor(rpcUrl: string, contractAddress:string) {
    this.connection = new Connection(rpcUrl);
    this.contractAddress = contractAddress;
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
  async getActions(lastTx: string, offset?: number): Promise<{actions:SolLockEvent[],lastTx:string}> {

    // 获取合约的公钥
    console.log("contractAddress  ==== ",this.contractAddress)
    const contractPublicKey = new PublicKey(this.contractAddress);

    console.log("--------------------------------------------------")
    const borshCoder = new BorshCoder(crossBridgeIdl as Idl);

    let option:SignaturesForAddressOptions = { 
      limit: 1000,
    }
    if(lastTx){
      option.until = lastTx;
    }

    // 获取最新的交易签名
    const transactionList = await this.connection.getSignaturesForAddress(
      contractPublicKey, 
      option
    );

    let actions:SolLockEvent[] = [];
    let signatures = [];

    let txs = await this.connection.getTransactions(transactionList.map(v=>v.signature))

    // 处理新交易
    txs.forEach(async (tx) => {
      if (!tx) {
        return;
      }
  
      // console.log(dayjs(new Date(tx.blockTime!*1000)).format("YYYY-MM-DD HH:mm:ss"));
      let user = '';
      let type = '';
      let args: any[] = [];
      tx.transaction.message.instructions.forEach((instruction) => {
        // 判断是否是合约的调用
        const programId = tx.transaction.message.accountKeys[instruction.programIdIndex];
        if (!programId.equals(contractPublicKey)) {
          return;
        }
  
        const decodedIx = borshCoder.instruction.decode(instruction.data, 'base58');
        if (decodedIx == null) {
          return;
        }
  
        // 获取交易中的账户信息
        const accountMetas = instruction.accounts.map((idx) => ({
          pubkey: tx.transaction.message.accountKeys[idx],
          isSigner: tx.transaction.message.isAccountSigner(idx),
          isWritable: tx.transaction.message.isAccountWritable(idx),
        }));
  
        // 格式化解析结果
        const formatted = borshCoder.instruction.format(decodedIx, accountMetas);
  
        user = formatted!.accounts[0].pubkey.toBase58();
        type = decodedIx.name;
        args = formatted!.args;
        // console.log({ name: decodedIx.name, ...formatted });
      });
  
      if (type == 'deposit') {
        let amont = BigNumber(args[0].data).div(100000000000).toString();
        if(amont != '0'){
          actions.push({
            Type: type,
            TxHash: tx.transaction.signatures[0],
            ActionIndex: 0,
            BlockNumber: tx.blockTime || 0,
            ActionPos: 0,
            GlobalActionSeq: 0,
            Asset: 'CKS',
            Precision: 2,
            From: user,
            To: 'ckt1qyqz8yt6m50pu32ztx2cv7dlcwm7986czg8s5qjvz2',
            Amount: amont.toString(),
            Memo: '10CKS',
          });
        }

      }
    });

    return {
      actions: actions,
      lastTx: signatures[0],
    };
  }

  getTransaction(txHash: string): Promise<any> {
    return new Promise((resolve, reject) => {
      resolve({});
    });
  }
}


const crossBridgeIdl = {
  "version": "0.1.0",
  "name": "cross_bridge",
  "instructions": [
    {
      "name": "init",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "stateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "escrowWalletAssociateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "stateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "escrowWalletAssociateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userAssociatedAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "stateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "escrowWalletAssociateAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "userAssociatedAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "State",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "publicKey"
          },
          {
            "name": "mint",
            "type": "publicKey"
          },
          {
            "name": "escrowWallet",
            "type": "publicKey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "stage",
            "type": "u8"
          },
          {
            "name": "bumps",
            "type": {
              "defined": "Bumps"
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Bumps",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stateBump",
            "type": "u8"
          },
          {
            "name": "walletBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Stage",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Deposit"
          },
          {
            "name": "WithDraw"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidUser",
      "msg": "Invalid user of state account"
    },
    {
      "code": 6001,
      "name": "InvalidStage",
      "msg": "Invalid state storage"
    },
    {
      "code": 6002,
      "name": "InsufficientFunds",
      "msg": "insufficient funds"
    }
  ]
}
