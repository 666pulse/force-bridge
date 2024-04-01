import { HashType, blockchain, utils } from '@ckb-lumos/base';
import { bytes, number, BytesLike } from "@ckb-lumos/codec";

function toArrayBuffer(buf) {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
}

function toBigUInt64LE(num) {
  num = BigInt(num);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(num);
  return toArrayBuffer(buf);
}

function generateTypeID(input, outputIndex) {

  // const s = core.SerializeCellInput(normalizers.NormalizeCellInput(input));
  // const i = toBigUInt64LE(outputIndex);
  // const ckbHasher = new utils.CKBHasher();
  // ckbHasher.update(s);
  // ckbHasher.update(i);
  // return ckbHasher.digestHex();

  const outPointBuf = blockchain.CellInput.pack(input);
  const outputIndexBuf = bytes.hexify(number.Uint64LE.pack(outputIndex));
  const ckbHasher = new utils.CKBHasher();
  ckbHasher.update(outPointBuf);
  ckbHasher.update(outputIndexBuf);
  return ckbHasher.digestHex();
}

export function generateTypeIDScript(input, outputIndex) {
  const args = generateTypeID(input, outputIndex);
  return {
    codeHash: '0x00000000000000000000000000000000000000000000000000545950455f4944',
    hashType: 'type' as HashType,
    args,
  };
}
