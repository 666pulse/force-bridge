import { Connection, PublicKey } from '@solana/web3.js';
import { BorshCoder, Idl } from '@coral-xyz/anchor';
import { BigNumber } from 'bignumber.js';

// 创建一个连接到Solana区块链的实例
const connection = new Connection('https://devnet.helius-rpc.com/?api-key=4327eb86-4e9f-4126-bad7-cdc60699afdb');

// 要监控的合约地址
const contractAddress = 'B2bYAPkQwmsuAnpyx4Efe3YR1FwKw4ApdxBW5rSSh7NQ';
const tokenContractAddress = 'ssSjvvxJQddW9EgBE7CbEW64iQkUPDxU7AMqicvDqfQ';

const crossBridgeIdl = {
  version: '0.1.0',
  name: 'cross_bridge',
  instructions: [
    {
      name: 'init',
      accounts: [
        {
          name: 'user',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'stateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'escrowWalletAssociateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'rent',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [],
    },
    {
      name: 'deposit',
      accounts: [
        {
          name: 'user',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'stateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'escrowWalletAssociateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'userAssociatedAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'withdraw',
      accounts: [
        {
          name: 'user',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'stateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'escrowWalletAssociateAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mint',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'userAssociatedAccount',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'tokenProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'amount',
          type: 'u64',
        },
      ],
    },
  ],
  accounts: [
    {
      name: 'State',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'user',
            type: 'publicKey',
          },
          {
            name: 'mint',
            type: 'publicKey',
          },
          {
            name: 'escrowWallet',
            type: 'publicKey',
          },
          {
            name: 'amount',
            type: 'u64',
          },
          {
            name: 'stage',
            type: 'u8',
          },
          {
            name: 'bumps',
            type: {
              defined: 'Bumps',
            },
          },
        ],
      },
    },
  ],
  types: [
    {
      name: 'Bumps',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'stateBump',
            type: 'u8',
          },
          {
            name: 'walletBump',
            type: 'u8',
          },
        ],
      },
    },
    {
      name: 'Stage',
      type: {
        kind: 'enum',
        variants: [
          {
            name: 'Deposit',
          },
          {
            name: 'WithDraw',
          },
        ],
      },
    },
  ],
  errors: [
    {
      code: 6000,
      name: 'InvalidUser',
      msg: 'Invalid user of state account',
    },
    {
      code: 6001,
      name: 'InvalidStage',
      msg: 'Invalid state storage',
    },
    {
      code: 6002,
      name: 'InsufficientFunds',
      msg: 'insufficient funds',
    },
  ],
};

// 监控新交易的函数
const monitorNewTransactions = async () => {
  const borshCoder = new BorshCoder(crossBridgeIdl as Idl);

  // 获取合约的公钥
  const contractPublicKey = new PublicKey(contractAddress);

  console.log('--------------------------------------------------');

  // 获取最新的交易签名
  const transactionList = await connection.getSignaturesForAddress(contractPublicKey, {
    limit: 1000,
  });


  let actions: any[] = [];
  let signatures = [];

  let txs = await connection.getTransactions(transactionList.map(v=>v.signature))

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
      let amont = BigNumber(args[0].data).div(1000000000).toString();
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
        To: 'ckt1qyq9sa6lv9a3m2rysecnrquft3tm34akq9eq35ct3k',
        Amount: amont.toString(),
        Memo: '10 CKS',
      });
    }
  });

  console.log(actions)
};

// 启动监控
monitorNewTransactions();
