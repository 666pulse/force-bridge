use ckb_std::{ckb_constants::Source, error::SysError, high_level::{load_cell_data, load_cell_type}};
use ckb_std::ckb_types::packed::Script;
use force_bridge_types::{
    SUDT_CODE_HASH, SUDT_HASH_TYPE, UDT_LEN
};


pub fn get_sudt_amount_from_source(source: Source, force_bridge_lock_hash: &[u8]) -> u128 {
    let mut index = 0;
    let mut sudt_sum = 0;
    loop {
        let cell_type = load_cell_type(index, source);
        match cell_type {
            Err(SysError::IndexOutOfBound) => break,
            Err(err) => panic!("iter input return an error: {:?}", err),
            Ok(cell_type) => {
                if !(is_sudt_typescript(cell_type, force_bridge_lock_hash)) {
                    index += 1;
                    continue;
                }

                let data = load_cell_data(index, source)
                    .expect("laod cell data fail");
                let mut buf = [0u8; UDT_LEN];
                if data.len() < UDT_LEN {
                    panic!("invalid sudt cell. index: {}, source: {:?}", index, source);
                }
                buf.copy_from_slice(&data[0..UDT_LEN]);
                sudt_sum += u128::from_le_bytes(buf);
                index += 1;
            }
        }
    }
    sudt_sum
}

pub fn is_sudt_typescript(script: Option<Script>, lock_hash: &[u8]) -> bool {
    if script.is_none() {
        return false;
    }
    let script = script.unwrap();
    if script.code_hash().raw_data().as_ref() == SUDT_CODE_HASH.as_ref()
        && script.args().raw_data().as_ref() == lock_hash
        && script.hash_type() == SUDT_HASH_TYPE.into()
    {
        return true;
    }
    false
}
