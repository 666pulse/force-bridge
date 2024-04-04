// invoke in sol handler

import { Connection, Repository } from 'typeorm';
import { SolUnlockStatus } from './entity/SolUnlock';
import { CkbBurn, CkbMint, SolLock, SolUnlock, ICkbMint, ISolLock, IQuery, LockRecord, UnlockRecord } from './model';
import { CollectorCkbMint } from './entity/CkbMint';

export class SolDb implements IQuery {
  private collectorCkbMintRepository: Repository<CollectorCkbMint>;
  private solLockRepository: Repository<SolLock>;
  private solUnlockRepository: Repository<SolUnlock>;

  constructor(private conn: Connection) {
    this.collectorCkbMintRepository = conn.getRepository(CollectorCkbMint);
    this.solLockRepository = conn.getRepository(SolLock);
    this.solUnlockRepository = conn.getRepository(SolUnlock);
  }

  async getLastedGlobalActionSeq(): Promise<number> {
    const rawRes = await this.conn.manager.query('select max(global_action_Seq) as lasted_global_seq from sol_lock');
    return rawRes[0].lasted_global_seq || -1;
  }

  async getActionPos(globalActionSeq: number): Promise<number> {
    const rawRes = await this.conn.manager.query(
      'select action_pos from sol_lock where global_action_Seq = ' + globalActionSeq,
    );
    return rawRes.length === 0 ? 0 : rawRes[0].action_pos;
  }

  async createCkbMint(records: ICkbMint[]): Promise<void> {
    const dbRecords = records.map((r) => this.collectorCkbMintRepository.create(r));
    await this.collectorCkbMintRepository.save(dbRecords);
  }

  async saveSolUnlock(records: SolUnlock[]): Promise<void> {
    await this.solUnlockRepository.save(records);
  }

  async createSolLock(records: ISolLock[]): Promise<void> {
    const dbRecords = records.map((r) => this.solLockRepository.create(r));
    await this.solLockRepository.save(dbRecords);
  }

  async getSolUnlockRecordsToUnlock(status: SolUnlockStatus, take = 1): Promise<SolUnlock[]> {
    return this.solUnlockRepository.find({
      where: {
        status,
      },
      take,
    });
  }

  async getLockRecordsByCkbAddress(ckbRecipientAddr: string, XChainAsset: string): Promise<LockRecord[]> {
    return await this.conn
      .getRepository(CkbMint)
      .createQueryBuilder('ckb')
      .innerJoinAndSelect('sol_lock', 'sol', 'sol.id = ckb.id')
      .where('ckb.recipient_lockscript = :recipient AND ckb.asset = :asset', {
        recipient: ckbRecipientAddr,
        asset: XChainAsset,
      })
      .select(
        `
        sol.sender as sender, 
        ckb.recipient_lockscript as recipient , 
        sol.amount as lock_amount,
        ckb.amount as mint_amount,
        sol.id as lock_hash,
        ckb.mint_hash as mint_hash,
        sol.updated_at as lock_time, 
        ckb.updated_at as mint_time, 
        ckb.status as status,
        ckb.asset as asset,
        ckb.message as message
      `,
      )
      .orderBy('ckb.updated_at', 'DESC')
      .getRawMany();
  }

  async getUnlockRecordsByCkbAddress(ckbLockScriptHash: string, XChainAsset: string): Promise<UnlockRecord[]> {
    return await this.conn
      .getRepository(CkbBurn)
      .createQueryBuilder('ckb')
      .innerJoinAndSelect('sol_unlock', 'sol', 'sol.ckb_tx_hash = ckb.ckb_tx_hash')
      .where('ckb.sender_address = :sender_address AND ckb.asset = :asset', {
        sender_address: ckbLockScriptHash,
        asset: XChainAsset,
      })
      .select(
        `
        ckb.sender_address as sender, 
        sol.recipient_address as recipient ,
        ckb.amount as burn_amount, 
        sol.amount as unlock_amount,
        ckb.ckb_tx_hash as burn_hash,
        sol.sol_tx_hash as unlock_hash,
        sol.updated_at as unlock_time, 
        ckb.updated_at as burn_time, 
        sol.status as status,
        ckb.asset as asset,
        sol.message as message
      `,
      )
      .orderBy('ckb.updated_at', 'DESC')
      .getRawMany();
  }

  async getLockRecordsByXChainAddress(XChainSender: string, XChainAsset: string): Promise<LockRecord[]> {
    return await this.conn
      .getRepository(CkbMint)
      .createQueryBuilder('ckb')
      .innerJoinAndSelect('sol_lock', 'sol', 'sol.id = ckb.id')
      .where('sol.sender = :sender AND ckb.asset = :asset', { sender: XChainSender, asset: XChainAsset })
      .select(
        `
        sol.sender as sender, 
        ckb.recipient_lockscript as recipient , 
        sol.amount as lock_amount,
        ckb.amount as mint_amount,
        sol.id as lock_hash,
        ckb.mint_hash as mint_hash,
        sol.updated_at as lock_time, 
        ckb.updated_at as mint_time, 
        ckb.status as status,
        ckb.asset as asset,
        ckb.message as message
      `,
      )
      .orderBy('ckb.updated_at', 'DESC')
      .getRawMany();
  }

  async getUnlockRecordsByXChainAddress(XChainRecipientAddr: string, XChainAsset: string): Promise<UnlockRecord[]> {
    return await this.conn
      .getRepository(CkbBurn)
      .createQueryBuilder('ckb')
      .innerJoinAndSelect('sol_unlock', 'sol', 'sol.ckb_tx_hash = ckb.ckb_tx_hash')
      .where('ckb.recipient_address = :recipient_address AND ckb.asset = :asset', {
        recipient_address: XChainRecipientAddr,
        asset: XChainAsset,
      })
      .select(
        `
        ckb.sender_address as sender, 
        sol.recipient_address as recipient ,
        ckb.amount as burn_amount, 
        sol.amount as unlock_amount,
        ckb.ckb_tx_hash as burn_hash,
        sol.sol_tx_hash as unlock_hash,
        sol.updated_at as unlock_time, 
        ckb.updated_at as burn_time, 
        sol.status as status,
        ckb.asset as asset,
        sol.message as message
      `,
      )
      .orderBy('ckb.updated_at', 'DESC')
      .getRawMany();
  }
}
