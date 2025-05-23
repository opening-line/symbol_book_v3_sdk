// オフライン（オフチェーン）上で署名を集めるコード
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { waitTxStatus } from "./waitTxStatus"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// 転送トランザクション1（accountA => accountB）
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [],
    "\0Hello, accountB!",
  )

// 転送トランザクション1（accountB => accountA）
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Hello, accountA!",
  )

const txs = [
  {
    transaction: transferDescriptor1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptor2,
    signer: accountB.publicKey,
  },
]

const innerTransactions = txs.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHash =
  SymbolFacade.hashEmbeddedTransactions(innerTransactions)

const aggregateDescriptor =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHash,
    innerTransactions,
  )

const txAgg = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptor,
  accountA.publicKey,
  100,
  60 * 60 * 2,
  1, // 連署者数（accountBの連署が必要）
)

const signatureAgg = accountA.signTransaction(txAgg)
const jsonPayloadAgg =
  facade.transactionFactory.static.attachSignature(
    txAgg,
    signatureAgg,
  )

console.log("署名済みペイロード生成…")

const payloadAgg = JSON.parse(jsonPayloadAgg).payload

console.log("ペイロード",payloadAgg)

// （実際はこれ以降は別のコード上で実装するものだが、便宜上同じコード上に記載）
// メール等何かの方法（オフライン）でpayloadAggを送る

// ペイロードからTxの復元
console.log("ペイロードからTxの復元実施…")
const restoredTxAgg =
  models.AggregateCompleteTransactionV2.deserialize(
    utils.hexToUint8(payloadAgg),
  )

//検証を行い、改ざんされていないことを確認する
console.log("署名の検証実施…")
const responseVerify = facade.verifyTransaction(
  restoredTxAgg,
  restoredTxAgg.signature,
)

if (!responseVerify) throw new Error("署名の検証に失敗しました。")

console.log("署名の検証に成功しました。")

//accountBの連署
const cosignB = facade.cosignTransaction(
  accountB.keyPair,
  restoredTxAgg,
)

//連署者の署名追加
console.log("オフライン署名の実施…")
restoredTxAgg.cosignatures.push(cosignB)

const jsonPayloadRestoredTxAgg = JSON.stringify({
  payload: utils.uint8ToHex(restoredTxAgg.serialize()),
})

console.log("===オフライン署名したトランザクションのアナウンス===")
console.log("アナウンス開始")
const responseRestoredTxAgg = await fetch(
  new URL("/transactions", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadRestoredTxAgg,
  },
).then((res) => res.json())

console.log("アナウンス結果", responseRestoredTxAgg)

const hashRestoredTxAgg = facade.hashTransaction(restoredTxAgg)

await waitTxStatus(
  hashRestoredTxAgg.toString(),
  NODE_URL,
  "confirmed",
)
