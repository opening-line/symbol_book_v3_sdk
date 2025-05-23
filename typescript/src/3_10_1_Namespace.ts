// ネームスペースを登録しアカウントに紐づけるコード
import { PrivateKey } from "symbol-sdk"
import {
  Address,
  Network,
  SymbolFacade,
  descriptors,
  models,
  generateNamespaceId,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { waitTxStatus } from "./waitTxStatus"
import { convertHexValues } from "./convertHexValues"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// ルートネームスペース名の指定
// ブロックチェーン内でユニークである必要があるので、ランダムな英数字文字列を追加する
const rootNamespace =
  "namespace_" + Math.random().toString(36).substring(2, 7)
// ネームスペースIDの生成
const rootNamespaceId = generateNamespaceId(rootNamespace)

const namespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(rootNamespaceId), // ネームスペースID
    models.NamespaceRegistrationType.ROOT, // ルートネームスペースとして登録
    new models.BlockDuration(86400n), // レンタル期間 （ブロック数）
    undefined, // ルートネームスペースの場合はundefined
    rootNamespace, // レンタルするネームスペース名
  )

// サブネームスペース名の指定
const subNamespace = "tarou"
const subNamespaceId = generateNamespaceId(
  subNamespace,
  rootNamespaceId, // 第二引数に親に当たるネームスペースIDを指定
)

const subNamespaceRegistrationDescriptor =
  // ネームスペース登録トランザクション
  new descriptors.NamespaceRegistrationTransactionV1Descriptor(
    new models.NamespaceId(subNamespaceId),
    models.NamespaceRegistrationType.CHILD, // サブネームスペースとして登録
    undefined, // サブネームスペースの場合は省略可能
    new models.NamespaceId(rootNamespaceId), // 親に当たるネームスペースIDを指定
    subNamespace,
  )

const addressAliasDescriptor =
  // ネームスペースをアドレスにリンクするトランザクション
  new descriptors.AddressAliasTransactionV1Descriptor(
    new models.NamespaceId(subNamespaceId), // リンクするネームスペースID
    accountA.address, // リンクするアカウントのアドレス
    models.AliasAction.LINK, // リンクする（LINK）、リンクを外す（UNLINK）
  )

const transferDescriptor =
  // 自分自身にネームスペースを使って転送トランザクションを行う
  new descriptors.TransferTransactionV1Descriptor(
    Address.fromNamespaceId(
      new models.NamespaceId(subNamespaceId),
      Network.TESTNET.identifier
    ), // 送信先アカウントをネームスペースで指定
    [],
    "\0Hello, AccountA!", 
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
  {
    transaction: transferDescriptor,
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

console.log("===ネームスペース登録及びリンクトランザクション===")
console.log("アナウンス開始")

const responseAgg = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadAgg,
}).then((res) => res.json())

console.log("アナウンス結果", responseAgg)

const hashAgg = facade.hashTransaction(txAgg)

await waitTxStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)

//ネームスペース情報を取得する（サブネームスペースの情報）
//ネームスペース情報が登録されるまでの時差があるため数秒程度待つ 
await new Promise(resolve => setTimeout(resolve, 5000));  

const nameSpaceIdHex = new models.NamespaceId(subNamespaceId)
  .toString()
  .replace("0x", "")
const nameSpaceInfo = await fetch(
  new URL("/namespaces/" + nameSpaceIdHex, NODE_URL),
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  },
).then((res) => res.json())

console.log(
  "ネームスペース情報JSON表示",
  JSON.stringify(convertHexValues(nameSpaceInfo), null, 2),
)
