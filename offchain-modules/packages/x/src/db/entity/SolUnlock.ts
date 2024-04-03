import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { dbTxStatus } from './CkbMint';

export type SolUnlockStatus = dbTxStatus;

@Entity()
export class SolUnlock {
  @PrimaryColumn()
  ckbTxHash: string;

  @Column()
  asset: string;

  @Column()
  amount: string;

  @Column()
  recipientAddress: string;

  @Column({ nullable: true })
  solTxHash: string;

  @Column({ default: 'todo' })
  status: SolUnlockStatus;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
