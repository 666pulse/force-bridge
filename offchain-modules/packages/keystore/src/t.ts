import { KeyStore } from "./KeyStore";

const password = '123456';
// {
//     "ethAddress": "0x7B2419E0Ee0BD034F7Bf24874C12512AcAC6e21C",
//     "ckbPubkeyHash": "0x42a34b11710e40b97180f8edae2760c0ab69bcf3",
//     "ckbAddress": "ckb1qyqy9g6tz9csus9ewxq03mdwyasvp2mfhnes0emum7"
// },
const store = KeyStore.createFromPairs(
    {
        "multisig-1": "0xc4ad657963930fbff2e9de3404b30a4e21432c89952ed430b56bf802945ed37a",
    },
    password,
);

const encrypted = store.getEncryptedData();
console.log(JSON.stringify(encrypted));

const ids = store.listKeyIDs();
console.log(ids);

store.decrypt(password);

store.getDecryptedByKeyID("multisig-1")
