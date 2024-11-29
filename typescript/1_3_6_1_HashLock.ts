import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"
import { sendTransaction } from "./functions/sendTransaction"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// アグリゲートボンデッドトランザクションの作成と署名

// 転送トランザクション1(accountA=>accountB)
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(1000000n), // 1xym
      ),
    ],
    "\0Send 1XYM",
  )

// 転送トランザクション2(accountB=>accountA)
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address, // 送信先アカウントのアドレス
    [],
    "\0OK",
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
  new descriptors.AggregateBondedTransactionV2Descriptor(
    innerTransactionHash,
    innerTransactions,
  )

const txAgg = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptor,
  accountA.publicKey,
  100,
  60 * 60 * 2,
  1, // 連署者数
)

const signatureAgg = accountA.signTransaction(txAgg) // 署名
const jsonPayloadAgg =
  facade.transactionFactory.static.attachSignature(
    txAgg,
    signatureAgg,
  ) // ペイロード

const hashAgg = facade.hashTransaction(txAgg)

// ハッシュロックトランザクションの作成、署名、アナウンス

const hashLockDescriptor =
  new descriptors.HashLockTransactionV1Descriptor(
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
      new models.Amount(10000000n), // ロック用に１０XYMを預ける
    ),
    new models.BlockDuration(5760n), // ロック期間
    hashAgg,
  )

await sendTransaction(hashLockDescriptor, accountA, "ハッシュロックトランザクション")

// ロックTxが全ノードに伝播されるまで少し時間を置く
await new Promise((resolve) => setTimeout(resolve, 1000)) // 1秒待機

// アグリゲートボンデッドトランザクションのアナウンス 注意 アグリゲートボンデッドの場合エンドポイントが異なるので注意
const responseAgg = await fetch(
  new URL("/transactions/partial", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadAgg,
  },
).then((res) => res.json())

console.log({ responseAgg })

// 部分承認状態（partial）になることを確認
console.log("===アグリゲートボンデッドトランザクション===")
await awaitTransactionStatus(hashAgg.toString(), NODE_URL, "partial")

// 署名要求トランザクションの確認と連署
const cosignature = accountB.cosignTransaction(txAgg, true)

// アナウンス
const cosignatureRequest = {
  // @ts-ignore 型情報にparentHashが含まれていため
  parentHash: cosignature.parentHash.toString(),
  signature: cosignature.signature.toString(),
  signerPublicKey: cosignature.signerPublicKey.toString(),
  version: cosignature.version.toString(),
}

const responseCos = await fetch(
  new URL("/transactions/cosignature", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cosignatureRequest),
  },
).then((res) => res.json())

console.log({ responseCos })

console.log("===アグリゲートボンデッドトランザクションへの連署===")
await awaitTransactionStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)
