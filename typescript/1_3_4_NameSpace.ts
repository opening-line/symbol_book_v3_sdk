// ネームスペースを登録しアカウントに紐づけるコード
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

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// ルートネームスペース名の指定
// ブロックチェーン内でユニークである必要があるので、ランダムな英数字文字列を追加する
const rootNameSpace =
  "namespace_" + Math.random().toString(36).substring(2, 7)
// ネームスペースIDの生成
const rootNameSpaceId = generateNamespaceId(rootNameSpace)

const namespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(rootNameSpaceId), // ネームスペースID
    models.NamespaceRegistrationType.ROOT, // ルートネームスペースとして登録
    new models.BlockDuration(86400n), // レンタル期間 （ブロック数）
    undefined, // ルートネームスペースの場合はundefined
    rootNameSpace, // レンタルするネームスペース名
  )

// サブネームスペース名の指定
const subNameSpace = "tarou"
const subNameSpaceId = generateNamespaceId(
  subNameSpace,
  rootNameSpaceId, // 第二引数に親に当たるネームスペースIDを指定
)

const subNamespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(subNameSpaceId),
    models.NamespaceRegistrationType.CHILD, // サブネームスペースとして登録
    undefined, // サブネームスペースの場合は省略可能
    new models.NamespaceId(rootNameSpaceId), // 親に当たるネームスペースIDを指定
    subNameSpace,
  )

const addressAliasDescriptor =
  // ネームスペースをアドレスにリンクするトランザクション
  new descriptors.AddressAliasTransactionV1Descriptor(
    new models.NamespaceId(subNameSpaceId), // リンクするネームスペースID
    accountA.address, // リンクするアカウントのアドレス
    models.AliasAction.LINK, // リンクする（LINK）、リンクを外す（UNLINK）
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

console.log("===ネームスペース登録及びリンクトランザクション===")
await awaitTransactionStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)
