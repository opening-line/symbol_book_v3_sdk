import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  metadataGenerateKey,
  metadataUpdateValue,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

const keyText = "key_" + Math.random().toString(36).substring(2, 7) //メタデータのキー
const valueText = "test" //　メタデータの値
const metadataKey = metadataGenerateKey(keyText) //bigIntに変換
const textEncoder = new TextEncoder()
const metadataValue = metadataUpdateValue(
  textEncoder.encode(""),
  textEncoder.encode(valueText),
) //Uint8Arrayに変換

const accountMetadataDescriptor =
  // アカウントメタデータ登録トランザクション
  new descriptors.AccountMetadataTransactionV1Descriptor(
    accountA.address,
    metadataKey,
    metadataValue.length,
    metadataValue,
  )

const txs = [
  {
    transaction: accountMetadataDescriptor,
    signer: accountA.publicKey,
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

const aggregateDes = new descriptors.AggregateCompleteTransactionV2Descriptor(
  innerTransactionHash,
  innerTransactions,
)

const tx = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDes,
      accountA.publicKey,
      100,
      60 * 60 * 2,
    )
    .serialize(),
)

const signature = accountA.signTransaction(tx) //署名
const jsonPayload = facade.transactionFactory.static.attachSignature(
  tx,
  signature,
) //ペイロード

const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayload,
}).then((res) => res.json())

console.log({ response })

const hash = facade.hashTransaction(tx).toString()

//トランザクションの状態を確認できる
console.log(`トランザクションステータス`)
console.log(`${NODE_URL}/transactionStatus/${hash}`)

// Txがconfirmed状態になるまで10秒ごとに状態を確認
let txInfo
do {
  txInfo = await fetch(new URL(`/transactions/confirmed/${hash}`, NODE_URL), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }).then((res) => res.json())

  console.log({ txInfo })
  await new Promise((resolve) => setTimeout(resolve, 10000)) // 10秒待機
} while (txInfo.code === "ResourceNotFound")

console.log(`エクスプローラー`)
console.log(`https://testnet.symbol.fyi/transactions/${hash}`)
