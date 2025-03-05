// マルチシグアカウントの構成及びマルチシグアカウントからのトランザクションを行うコード
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { waitTxStatus } from "./waitTxStatus"
import { sendTransferFees } from "./sendTransferFees"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// 事前アカウント生成
const multisigAccount = facade.createAccount(PrivateKey.random())
const cosigAccount1 = facade.createAccount(PrivateKey.random())
const cosigAccount2 = facade.createAccount(PrivateKey.random())
const cosigAccount3 = facade.createAccount(PrivateKey.random())
const cosigAccount4 = facade.createAccount(PrivateKey.random())
console.log(
  "Multisig Account Address:",
  multisigAccount.address.toString(),
)
console.log(
  "Cosig Account 1 Address:",
  cosigAccount1.address.toString(),
)
console.log(
  "Cosig Account 2 Address:",
  cosigAccount2.address.toString(),
)
console.log(
  "Cosig Account 3 Address:",
  cosigAccount3.address.toString(),
)
console.log(
  "Cosig Account 4 Address:",
  cosigAccount4.address.toString(),
)

const feeAmount = 1000000n; // 1xym
const recipientAddresses = [multisigAccount.address, cosigAccount1.address];

console.log("===事前手数料転送トランザクション===");
// 手数料を送付するトランザクションを生成、署名、アナウンス
const hashPre = await sendTransferFees(accountA, recipientAddresses, feeAmount);

await waitTxStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

const multisigAccountModificationDescriptor =
  // マルチシグアカウント構成トランザクション
  new descriptors.MultisigAccountModificationTransactionV1Descriptor(
    3, // マルチシグの除名に必要な署名数の増減値
    3, // マルチシグのトランザクションに必要な署名数の増減値
    [
      // 追加するアカウントのアドレスリスト
      cosigAccount1.address,
      cosigAccount2.address,
      cosigAccount3.address,
      cosigAccount4.address,
    ],
    [], // 除名するアカウントのアドレスリスト
  )

const innerTxsModification = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    multisigAccountModificationDescriptor,
    multisigAccount.publicKey, // マルチシグ化するアカウントの公開鍵を指定
  ),
]

const innerTransactionHashMod = SymbolFacade.hashEmbeddedTransactions(
  innerTxsModification,
)

const aggregateDescriptorMod =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashMod,
    innerTxsModification,
  )

const txMod = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptorMod,
      multisigAccount.publicKey,
      100,
      60 * 60 * 2,
      4, // 連署者数（マルチシグの構成アカウント数分が必要）
    )
    .serialize(),
)

const signatureMod = multisigAccount.signTransaction(txMod)

//署名の付与
facade.transactionFactory.static.attachSignature(txMod, signatureMod)

//マルチシグ構成アカウントの連署
const cosig1 = facade.cosignTransaction(cosigAccount1.keyPair, txMod)
//連署者の署名追加
txMod.cosignatures.push(cosig1)
const cosig2 = facade.cosignTransaction(cosigAccount2.keyPair, txMod)
txMod.cosignatures.push(cosig2)
const cosig3 = facade.cosignTransaction(cosigAccount3.keyPair, txMod)
txMod.cosignatures.push(cosig3)
const cosig4 = facade.cosignTransaction(cosigAccount4.keyPair, txMod)
txMod.cosignatures.push(cosig4)

//トランザクションをペイロード化 => 文字列に整形
const jsonPayloadMod = JSON.stringify({
  payload: utils.uint8ToHex(txMod.serialize()),
})

console.log("===マルチシグアカウント構成トランザクション===")
console.log("アナウンス開始")
const responseMod = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMod,
}).then((res) => res.json())

console.log("アナウンス結果", responseMod)

const hashMod = facade.hashTransaction(txMod)

await waitTxStatus(
  hashMod.toString(),
  NODE_URL,
  "confirmed",
)

// 転送トランザクション(multisigAccount=>accountA)
const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Hello accountA From Multisig Account!",
  )

const innerTxsTranfer = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    transferDescriptor,
    multisigAccount.publicKey,
  ),
]

const innerTransactionHashTf = SymbolFacade.hashEmbeddedTransactions(
  innerTxsTranfer,
)

const aggregateDescriptorTf =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashTf,
    innerTxsTranfer,
  )

const txTf = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptorTf,
      cosigAccount1.publicKey, // 起案者であるcosigAccount1を指定
      100,
      60 * 60 * 2,
      2, // 連署者数（起案者を除く、トランザクション承認に必要な数）
    )
    .serialize(),
)

const signatureTf = cosigAccount1.signTransaction(txTf)

facade.transactionFactory.static.attachSignature(txTf, signatureTf)

const cosig2Tf = facade.cosignTransaction(
  cosigAccount2.keyPair,
  txTf,
)
txTf.cosignatures.push(cosig2Tf)
const cosig3Tf = facade.cosignTransaction(
  cosigAccount3.keyPair,
  txTf,
)
txTf.cosignatures.push(cosig3Tf)

const jsonPayloadTf = JSON.stringify({
  payload: utils.uint8ToHex(txTf.serialize()),
})

console.log("===転送トランザクション（マルチシグアカウントから）===")
console.log("アナウンス開始")
const responseTf = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadTf,
}).then((res) => res.json())

console.log("アナウンス結果", responseTf)

const hashTf = facade.hashTransaction(txTf)

await waitTxStatus(hashTf.toString(), NODE_URL, "confirmed")
