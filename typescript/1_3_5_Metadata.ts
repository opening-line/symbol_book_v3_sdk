import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  metadataGenerateKey,
  metadataUpdateValue,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// メタデータのキー
const keyText = "key_" + Math.random().toString(36).substring(2, 7)
const valueText = "test" // 　メタデータの値
const metadataKey = metadataGenerateKey(keyText) // bigIntに変換
const textEncoder = new TextEncoder()
const metadataValue = metadataUpdateValue(
  textEncoder.encode(""),
  textEncoder.encode(valueText),
) // Uint8Arrayに変換

const accountMetadataDescriptor =
  // アカウントメタデータ登録トランザクション
  new descriptors.AccountMetadataTransactionV1Descriptor(
    accountA.address,
    metadataKey,
    metadataValue.length,
    metadataValue,
  )

// メタデータ登録はアグリゲートトランザクションにする必要がある
const innerTransactions = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    accountMetadataDescriptor,
    accountA.publicKey,
  ),
]

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
)

const signatureAgg = accountA.signTransaction(txAgg) // 署名
const jsonPayloadAgg =
  facade.transactionFactory.static.attachSignature(
    txAgg,
    signatureAgg,
  ) // ペイロード

const responseAgg = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadAgg,
}).then((res) => res.json())

console.log({ responseAgg })

const hashAgg = facade.hashTransaction(txAgg)

console.log("===アカウントメタデータトランザクション===")
await awaitTransactionStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)
