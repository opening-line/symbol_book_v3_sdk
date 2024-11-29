// メタデータをアカウントに紐づけるコード
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

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// メタデータのキーの指定
// 紐づける対象の中でユニークである必要がある
const keyText = "key_" + Math.random().toString(36).substring(2, 7)
// メタデータの値の指定
const valueText = "test"
// bigIntに変換
const metadataKey = metadataGenerateKey(keyText)
// 文字列をエンコードしてUint8Arrayに変換するためのインターフェース
const textEncoder = new TextEncoder()
// 古い値を新しい値に更新するためのメタデータペイロードを作成
const metadataValue = metadataUpdateValue(
  textEncoder.encode(""), // 古い値を指定 （初回は空文字）
  textEncoder.encode(valueText), // 新しい値を指定
)

const accountMetadataDescriptor =
  // アカウントメタデータ登録トランザクション
  new descriptors.AccountMetadataTransactionV1Descriptor(
    accountA.address, //紐付ける対象のアカウントアドレス
    metadataKey, //紐づけるメタデータのキー
    metadataValue.length, //紐づけるメタデータの長さ
    metadataValue, //紐づけるメタデータの値
  )

// メタデータのトランザクションはアグリゲートトランザクションに指定する必要がある
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

const signatureAgg = accountA.signTransaction(txAgg)
const jsonPayloadAgg =
  facade.transactionFactory.static.attachSignature(
    txAgg,
    signatureAgg,
  )

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
