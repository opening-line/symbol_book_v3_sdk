import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
  generateNamespaceId,
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

// ルートネームスペースはユニークである必要があるので、ランダムな英数字文字列を追加
const rootNameSpace =
  "namespace_" + Math.random().toString(36).substring(2, 7)
const rootNameSpaceId = generateNamespaceId(rootNameSpace)
const namespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(rootNameSpaceId), // ネームスペースID
    models.NamespaceRegistrationType.ROOT, // タイプとしてルートネームスペースを指定
    new models.BlockDuration(86400n), // レンタル期間
    undefined, // 親に当たるネームスペースIDを指定（ルートの場合はundefined）
    rootNameSpace, // レンタルするネームスペース
  )

const accountSubNameSpace = "tarou" // サブネームスペース
const subNameSpaceId = generateNamespaceId(
  accountSubNameSpace,
  rootNameSpaceId,
)

const subNamespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(subNameSpaceId), // ネームスペースID
    models.NamespaceRegistrationType.CHILD, // タイプとしてサブネームスペースを指定
    undefined, // レンタル期間 (サブネームスペースの場合は省略)
    new models.NamespaceId(rootNameSpaceId), // 親に当たるネームスペースIDを指定
    accountSubNameSpace, // ネームスペース
  )

// リンクするネームスペースとアドレスの設定
const namespaceId = new models.NamespaceId(subNameSpaceId)
// ネームアドレスをアドレスにリンクするトランザクション
const addressAliasDescriptor =
  new descriptors.AddressAliasTransactionV1Descriptor(
    // Txタイプ:アドレスエイリアスTx
    namespaceId, // ネームスペースID
    accountA.address, // リンクを行うアドレス
    models.AliasAction.LINK,
  )

const txs = [
  {
    transaction: namespaceRegistrationDescriptor,
    signer: accountA.publicKey,
  },
  {
    transaction: subNamespaceRegistrationDescriptor,
    signer: accountA.publicKey,
  },
  {
    transaction: addressAliasDescriptor,
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

console.log("===ネームスペースレンタル及びリンクトランザクション===")
await awaitTransactionStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)
