#![no_std]
#![cfg_attr(not(test), no_main)]

#[cfg(test)]
extern crate alloc;

mod error;
mod actions;
mod sudt;
use alloc::vec::Vec;
use ckb_std::{ckb_constants::Source, high_level::{load_cell_data, QueryIter}};
use force_bridge_types::recipient_cell::RecipientDataView;
use crate::error::Error;


#[cfg(not(test))]
use ckb_std::default_alloc;
#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

pub fn program_entry() -> i8 {
    match burn() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}

pub fn burn() -> Result<(), Error> {
    let data_list = QueryIter::new(
        |index, source| load_cell_data(index, source),
        Source::GroupOutput,
    )
    .collect::<Vec<Vec<u8>>>();

    let recipient_data = match data_list.len() {
        0 => None,
        1 => Some(
            RecipientDataView::new(data_list[0].as_slice())
                .expect("RecipientDataView coding error"),
        ),
        _ => panic!("outputs have more than 1 xchain recipient cell"),
    };

    if let Some(data) = recipient_data {
        actions::verify_burn_token(data)
    }
    
    Ok(())
}
