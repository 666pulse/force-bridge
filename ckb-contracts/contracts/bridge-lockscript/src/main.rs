#![no_std]
#![cfg_attr(not(test), no_main)]

use crate::error::Error;
use ckb_std::{
    ckb_constants::Source, ckb_types::{bytes::Bytes, prelude::*}, debug, error::SysError, high_level::{load_cell_lock_hash, load_cell_type_hash, load_script, QueryIter}
};
use force_bridge_types::force_bridge_lockscript::ForceBridgeLockscriptArgsReader;
use molecule::prelude::Reader;

mod error;

#[cfg(test)]
extern crate alloc;

#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

pub fn program_entry() -> i8 {
    match lock() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}


pub fn lock() -> Result<(), Error> {
    ckb_std::debug!("This is a sample contract!");

    let script = load_script()?;

    let args: Bytes = script.args().unpack();
    debug!("script args is {:?}", args);

    let force_bridge_args = ForceBridgeLockscriptArgsReader::new_unchecked(&args);
    let owner_cell_type_hash = force_bridge_args.owner_cell_type_hash().raw_data().as_ref();
    let owner_lock_hash = get_owner_lock_hash(owner_cell_type_hash);

    let ok = QueryIter::new(
        |index, source| load_cell_lock_hash(index, source),
        Source::Input,
    )
    .any(|script| script.as_ref() == owner_lock_hash);

    if !ok {
        panic!("not authorized to unlock the cell");
    }

    Ok(())
}


fn get_owner_lock_hash(owner_cell_type_hash: &[u8]) -> [u8; 32] {
    let mut index = 0;
    let source = Source::CellDep;
    loop {
        let cell_type = load_cell_type_hash(index, source);
        match cell_type {
            Err(SysError::IndexOutOfBound) => panic!("owner cell not found"),
            Err(err) => panic!("iter input return an error: {:?}, index: {:?}", err, index),
            Ok(cell_type_hash_opt) => {
                if let Some(cell_type_hash) = cell_type_hash_opt {
                    if cell_type_hash == owner_cell_type_hash {
                        let data = load_cell_lock_hash(index, source)
                            .expect("load cell data fail");
                        return data;
                    }
                }
            }
        }
        index += 1;
    }
}