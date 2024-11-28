import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

//事前アカウント作成
const multisigAccount = facade.createAccount(PrivateKey.random())
const cosigAccount1 = facade.createAccount(PrivateKey.random())
const cosigAccount2 = facade.createAccount(PrivateKey.random())
const cosigAccount3 = facade.createAccount(PrivateKey.random())
const cosigAccount4 = facade.createAccount(PrivateKey.random())
console.log("Multisig Account Address:", multisigAccount.address.toString());
console.log("Cosign Account 1 Address:", cosigAccount1.address.toString());
console.log("Cosign Account 2 Address:", cosigAccount2.address.toString());
console.log("Cosign Account 3 Address:", cosigAccount3.address.toString());
console.log("Cosign Account 4 Address:", cosigAccount4.address.toString());

//転送トランザクション1（手数料分のxym送付）
const transferDescriptorPre1 = new descriptors.TransferTransactionV1Descriptor(
  multisigAccount.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
      new models.Amount(10000000n), //10xym
    ),
  ],
)

//転送トランザクション2（手数料分のxym送付）
const transferDescriptorPre2 = new descriptors.TransferTransactionV1Descriptor(
  cosigAccount1.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
      new models.Amount(10000000n), //10xym
    ),
  ],
)

const txsPre = [
  {
    transaction: transferDescriptorPre1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptorPre2,
    signer: accountA.publicKey,
  }
]

const innerTransactionsPre = txsPre.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashPre =
  SymbolFacade.hashEmbeddedTransactions(innerTransactionsPre)

const aggregateDescriptorPre = new descriptors.AggregateCompleteTransactionV2Descriptor(
  innerTransactionHashPre,
  innerTransactionsPre,
)

const txPre = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptorPre,
  accountA.publicKey,
  100,
  60 * 60 * 2,
);

const signaturePre = accountA.signTransaction(txPre) //署名
const jsonPayloadPre = facade.transactionFactory.static.attachSignature(
  txPre,
  signaturePre,
) //ペイロード

const responsePre = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadPre,
}).then((res) => res.json())

console.log({ responsePre })

const hashPre = facade.hashTransaction(txPre)

await awaitTransactionStatus(hashPre.toString(), NODE_URL, "confirmed");

// マルチシグアカウント構成トランザクション作成/署名/アナウンス
const multisigAccountModificationDescriptor = new descriptors.MultisigAccountModificationTransactionV1Descriptor(
  3,  // マルチシグ構成除名に必要な署名数の増減値
  3,  // マルチシグアカウントでのトランザクションに必要な署名数の増減値
  [   // 追加するアドレスのリスト
    cosigAccount1.address,
    cosigAccount2.address,
    cosigAccount3.address,
    cosigAccount4.address,
  ],
  []  // 除名するアドレスのリスト
);

const txsMod = [
  {
    transaction: multisigAccountModificationDescriptor,
    signer: multisigAccount.publicKey, //マルチシグ化するアカウントの公開鍵を指定
  }
]

const innerTransactionsMod = txsMod.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashMod =
  SymbolFacade.hashEmbeddedTransactions(innerTransactionsMod)

const aggregateDescriptorMod = new descriptors.AggregateCompleteTransactionV2Descriptor(
  innerTransactionHashMod,
  innerTransactionsMod,
)

const txMod = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptorMod,
      multisigAccount.publicKey,
      100,
      60 * 60 * 2,
    )
    .serialize(),
)

const signatureMod = multisigAccount.signTransaction(txMod)

facade.transactionFactory.static.attachSignature(txMod, signatureMod)

const cosign1 = facade.cosignTransaction(cosigAccount1.keyPair, txMod);
txMod.cosignatures.push(cosign1);
const cosign2 = facade.cosignTransaction(cosigAccount2.keyPair, txMod);
txMod.cosignatures.push(cosign2);
const cosign3 = facade.cosignTransaction(cosigAccount3.keyPair, txMod);
txMod.cosignatures.push(cosign3);
const cosign4 = facade.cosignTransaction(cosigAccount4.keyPair, txMod);
txMod.cosignatures.push(cosign4);

const jsonPayloadMod = utils.uint8ToHex(txMod.serialize()); //ペイロード

const responseMod = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMod,
}).then((res) => res.json())

console.log({ responseMod })

const hashMod = facade.hashTransaction(txMod)

await awaitTransactionStatus(hashMod.toString(), NODE_URL, "confirmed");

