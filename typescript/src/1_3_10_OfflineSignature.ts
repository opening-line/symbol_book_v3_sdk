// オフライン（オフチェーン）上で署名を集めるコード
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { 
  awaitTransactionStatus,
} from "../functions/awaitTransactionStatus"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
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

const payloadAgg = JSON.parse(jsonPayloadAgg).payload

// （実際はこれ以降は別のコード上で実装するものだが、便宜上同じコード上に記載）
// メール等何かの方法（オフライン）でpayloadAggを送る

// ペイロードからTxの復元
const restoredTxAgg =
  models.AggregateCompleteTransactionV2.deserialize(
    utils.hexToUint8(payloadAgg),
  )

//検証を行い、改ざんされていないことを確認する
const responseVerify = facade.verifyTransaction(
  restoredTxAgg,
  restoredTxAgg.signature,
)

if (!responseVerify) throw new Error("署名の検証に失敗しました。")

//accountBの連署
const cosignB = facade.cosignTransaction(
  accountB.keyPair,
  restoredTxAgg,
)

//連署者の署名追加
restoredTxAgg.cosignatures.push(cosignB)

const jsonPayloadRestoredTxAgg = JSON.stringify({
  payload: utils.uint8ToHex(restoredTxAgg.serialize()),
})

const responseRestoredTxAgg = await fetch(
  new URL("/transactions", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadRestoredTxAgg,
  },
).then((res) => res.json())

console.log({ responseRestoredTxAgg })

const hashRestoredTxAgg = facade.hashTransaction(restoredTxAgg)

console.log("===オフライン署名したトランザクションのアナウンス===")
await awaitTransactionStatus(
  hashRestoredTxAgg.toString(),
  NODE_URL,
  "confirmed",
)
