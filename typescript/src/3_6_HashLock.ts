// アグリゲートボンデッドトランザクションをハッシュロックし、オンチェーン上で連署を行う
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { waitTxStatus } from "./waitTxStatus"
import { convertHexValues } from "./convertHexValues"
import { createAndSendTx } from "./createAndSendTx"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// 転送トランザクション1(accountA=>accountB)
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
      ),
    ],
    "\0Send 1xym",
  )

// 転送トランザクション2(accountB=>accountA)
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Thank you!",
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
  1, // 連署者が必要な場合は必ず数を指定する（accountBの連署が必要）
)

const signatureAgg = accountA.signTransaction(txAgg)
const jsonPayloadAgg =
  facade.transactionFactory.static.attachSignature(
    txAgg,
    signatureAgg,
  )

// ハッシュロックに必要なトランザクションハッシュの生成
const hashAgg = facade.hashTransaction(txAgg)

const hashLockDescriptor =
  // ハッシュロックトランザクション
  new descriptors.HashLockTransactionV1Descriptor(
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
      new models.Amount(10000000n), // ロック用に固定で10xymを預ける
    ),
    new models.BlockDuration(5760n), // ロック期間（ブロック数）
    hashAgg, // ロックしたいトランザクションのハッシュ
  )

console.log("===ハッシュロックトランザクション===")
// アグリゲートでないトランザクションは生成からアナウンスまで同じ処理なので関数化
const hashLock = await createAndSendTx(
  hashLockDescriptor,
  accountA,
)

await waitTxStatus(
  hashLock.toString(),
  NODE_URL,
  "confirmed",
)

// ハッシュロックトランザクションが全ノードに伝播されるまで一秒ほど時間を置く
await new Promise((resolve) => setTimeout(resolve, 1000))

console.log("===アグリゲートボンデッドトランザクション===")
// アグリゲートボンデッドトランザクションのアナウンス
console.log("アナウンス開始")
const responseAgg = await fetch(
  // エンドポイントがに/transactions/partialであることに注意
  new URL("/transactions/partial", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadAgg,
  },
).then((res) => res.json())

console.log("アナウンス結果", responseAgg)

// partial（オンチェーン上で連署待ちの状態）の確認
await waitTxStatus(hashAgg.toString(), NODE_URL, "partial")

// アカウントBが連署を必要とするトランザクションを検出する処理
const query = new URLSearchParams({
  signerPublicKey: accountB.publicKey.toString(),
  embedded: "true", //インナートランザクションも検索の対象にする
  order:"desc" //新しい順に結果を返す
})

const txSearchInfo = await fetch(
  new URL("/transactions/partial?" + query.toString(), NODE_URL),
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  },
).then((res) => res.json())

console.log(
  "アグリゲートボンデッドトランザクションJSON表示",
  JSON.stringify(convertHexValues(txSearchInfo), null, 2),
)

const hashAggString = txSearchInfo.data[0].meta.aggregateHash
const hashAggRestore = new models.Hash256(
  Uint8Array.from(utils.hexToUint8(hashAggString))
)

// 連署者による署名
const cosignatureRequest = 
  accountB.cosignTransactionHash(hashAggRestore,true).toJson()
  
console.log("===アグリゲートボンデッドトランザクションへの連署===")
console.log("アナウンス開始")

const responseCos = await fetch(
  // エンドポイントが/transactions/cosignatureであることに注意
  new URL("/transactions/cosignature", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cosignatureRequest),
  },
).then((res) => res.json())

console.log("アナウンス結果", responseCos)

await waitTxStatus(hashAggString, NODE_URL, "confirmed")
