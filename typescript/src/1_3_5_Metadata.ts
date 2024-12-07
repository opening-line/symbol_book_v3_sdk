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
import { 
  awaitTransactionStatus,
} from "../functions/awaitTransactionStatus"
import { 
  convertHexValuesInObject,
} from "../functions/convertHexValuesInObject"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// メタデータのキーの指定
// 紐づける対象で同じキーを指定した場合は上書きとなる。今回はユニークなキーを指定する
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

//メタデータ情報を取得する(アドレスに設定されているメタデータ一覧)
const query1 = new URLSearchParams({
  targetAddress: accountA.address.toString(), // 設定されたアカウントアドレス
})

const metadataInfo1 = await fetch(
  new URL("/metadata?" + query1.toString(), NODE_URL),
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  },
).then((res) => res.json())

console.log(
  JSON.stringify(convertHexValuesInObject(metadataInfo1), null, 2),
)

//メタデータ情報を取得する(メタデータキーが指定されているメタデータ一覧)
//targetAddressを見ることで、特定のメタデータキーが付与されたアドレス一覧を作成できる
const query2 = new URLSearchParams({
  // メタデータキー
  scopedMetadataKey: metadataKey.toString(16).toUpperCase(),
  metadataType: "0", //　アカウントメタデータは0
})

const metadataInfo2 = await fetch(
  new URL("/metadata?" + query2.toString(), NODE_URL),
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  },
).then((res) => res.json())

console.log(
  JSON.stringify(convertHexValuesInObject(metadataInfo2), null, 2),
)
