// マルチシグアカウントの構成及びマルチシグアカウントからのトランザクションを行うコード
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import {
  waitTransactionStatus,
} from "./functions"
import { sendTransferFees } from "./functions/sendTransferFees"

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
  "Cosign Account 1 Address:",
  cosigAccount1.address.toString(),
)
console.log(
  "Cosign Account 2 Address:",
  cosigAccount2.address.toString(),
)
console.log(
  "Cosign Account 3 Address:",
  cosigAccount3.address.toString(),
)
console.log(
  "Cosign Account 4 Address:",
  cosigAccount4.address.toString(),
)

const feeAmount = 1000000n; // 1xym
const recipientAddresses = [multisigAccount.address, cosigAccount1.address];

console.log("===事前手数料転送トランザクション===");
// 手数料を送付するトランザクションを生成、署名、アナウンス
const hashPre = await sendTransferFees(accountA, recipientAddresses, feeAmount);

await waitTransactionStatus(
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

const innerTransactionsMod = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    multisigAccountModificationDescriptor,
    multisigAccount.publicKey, // マルチシグ化するアカウントの公開鍵を指定
  ),
]

const innerTransactionHashMod = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsMod,
)

const aggregateDescriptorMod =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
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
      4, // 連署者数（マルチシグの構成アカウント数分が必要）
    )
    .serialize(),
)

const signatureMod = multisigAccount.signTransaction(txMod)

//署名の付与
facade.transactionFactory.static.attachSignature(txMod, signatureMod)

//マルチシグ構成アカウントの連署
const cosign1 = facade.cosignTransaction(cosigAccount1.keyPair, txMod)
//連署者の署名追加
txMod.cosignatures.push(cosign1)
const cosign2 = facade.cosignTransaction(cosigAccount2.keyPair, txMod)
txMod.cosignatures.push(cosign2)
const cosign3 = facade.cosignTransaction(cosigAccount3.keyPair, txMod)
txMod.cosignatures.push(cosign3)
const cosign4 = facade.cosignTransaction(cosigAccount4.keyPair, txMod)
txMod.cosignatures.push(cosign4)

//トランザクションをペイロード化 => 文字列に整形
const jsonPayloadMod = JSON.stringify({
  payload: utils.uint8ToHex(txMod.serialize()),
})

console.log("===マルチシグアカウント構成トランザクション===")
const responseMod = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMod,
}).then((res) => res.json())

console.log("アナウンス結果", responseMod)

const hashMod = facade.hashTransaction(txMod)

await waitTransactionStatus(
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

const innerTransactionsTf = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    transferDescriptor,
    multisigAccount.publicKey,
  ),
]

const innerTransactionHashTf = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsTf,
)

const aggregateDescriptorTf =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashTf,
    innerTransactionsTf,
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

const cosign2Tf = facade.cosignTransaction(
  cosigAccount2.keyPair,
  txTf,
)
txTf.cosignatures.push(cosign2Tf)
const cosign3Tf = facade.cosignTransaction(
  cosigAccount3.keyPair,
  txTf,
)
txTf.cosignatures.push(cosign3Tf)

const jsonPayloadTf = JSON.stringify({
  payload: utils.uint8ToHex(txTf.serialize()),
})

console.log("===転送トランザクション（マルチシグアカウントから）===")
const responseTf = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadTf,
}).then((res) => res.json())

console.log("アナウンス結果", responseTf)

const hashTf = facade.hashTransaction(txTf)

await waitTransactionStatus(hashTf.toString(), NODE_URL, "confirmed")
