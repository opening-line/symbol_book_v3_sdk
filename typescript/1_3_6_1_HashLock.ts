// アグリゲートボンデッドトランザクションをハッシュロックし、オンチェーン上で連署を行う
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"
import { createAndSendTransaction } from "./functions/createAndSendTransaction"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)


const transferDescriptor1 =
// 転送トランザクション1(accountA=>accountB)
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(1000000n), // 1.000000xym
      ),
    ],
    "\0Send 1XYM",
  )

const transferDescriptor2 =
// 転送トランザクション2(accountB=>accountA)
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
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
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
      new models.Amount(10000000n), // ロック用に固定で１０XYMを預ける
    ),
    new models.BlockDuration(5760n), // ロック期間（ブロック数）
    hashAgg, // ロックしたいトランザクションのハッシュ
  )

// アグリゲートでないトランザクションは生成からアナウンスまで同じ処理なので関数化 
const hashLock = await createAndSendTransaction(
  hashLockDescriptor,
  accountA
)

console.log("===ハッシュロックトランザクション===")
await awaitTransactionStatus(hashLock.toString(), NODE_URL, "confirmed")

// ハッシュロックトランザクションが全ノードに伝播されるまで一秒ほど時間を置く
await new Promise((resolve) => setTimeout(resolve, 1000))

// アグリゲートボンデッドトランザクションのアナウンス
const responseAgg = await fetch(
  // エンドポイントがに/transactions/partialであることに注意
  new URL("/transactions/partial", NODE_URL),
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadAgg,
  },
).then((res) => res.json())

console.log({ responseAgg })

// partial（オンチェーン上で連署待ちの状態）の確認
console.log("===アグリゲートボンデッドトランザクション===")
await awaitTransactionStatus(hashAgg.toString(), NODE_URL, "partial")

// （実際はこれ以降は別のコード上で実装するものですが、便宜上同じコード上にあります）
// ロックされたトランザクションハッシュ（オンチェーン上でも確認可能）からトランザクションを参照
// TODO 実際は ハッシュ値からTxInfoを取得してそこからtxAggを再生成する必要あり
// もしくは自分宛の署名要求を何かの方法で検知できるか（監視あたりでチェック）

// 連署者による署名
const cosignature = accountB.cosignTransaction(txAgg, true)

const cosignatureRequest = {
  //連署するアグリゲートボンデッドトランザクションのトランザクションハッシュ値
  parentHash: facade.hashTransaction(txAgg).toString(), 
  //署名部分 
  signature: cosignature.signature.toString(),
  //連署者の公開鍵 
  signerPublicKey: cosignature.signerPublicKey.toString(),
  //署名したトランザクションのバージョン
  version: cosignature.version.toString(),
}

const responseCos = await fetch(
  // エンドポイントがに/transactions/cosignatureであることに注意  
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
