import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

//アグリゲートボンデッドトランザクションの作成と署名

//転送トランザクション1(accountA=>accountB)
const transferDescriptor1 = new descriptors.TransferTransactionV1Descriptor(
  accountB.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
      new models.Amount(1000000n), //1xym
    ),
  ],
  "\0Send 1XYM"
)

//転送トランザクション2(accountB=>accountA)
const transferDescriptor2 = new descriptors.TransferTransactionV1Descriptor(
  accountA.address, //送信先アカウントのアドレス
  [],
  "\0OK"
)

const txs = [
  {
    transaction: transferDescriptor1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptor1,
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

const aggregateDescriptor = new descriptors.AggregateBondedTransactionV2Descriptor(
  innerTransactionHash,
  innerTransactions,
)

const txAgg = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptor, 
  accountA.publicKey,
  100,             
  60 * 60 * 2,     
  1// 連署者数
);


const signatureAgg = accountA.signTransaction(txAgg) //署名
const jsonPayloadAgg = facade.transactionFactory.static.attachSignature(
  txAgg,
  signatureAgg,
) //ペイロード

const hashAgg = facade.hashTransaction(txAgg)

//ハッシュロックトランザクションの作成、署名、アナウンス

const hashLockDescriptor = new descriptors.HashLockTransactionV1Descriptor(
  new descriptors.UnresolvedMosaicDescriptor(
    new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
    new models.Amount(10000000n), //ロック用に１０XYMを預ける
  ),
  new models.BlockDuration(5760n), //ロック期間
  hashAgg,
)

const txLock = facade.createTransactionFromTypedDescriptor(
  hashLockDescriptor, //Txの中身
  accountA.publicKey, //送信元アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signatureLock = accountA.signTransaction(txLock) //署名
const jsonPayloadLock = facade.transactionFactory.static.attachSignature(
  txLock,
  signatureLock,
) //ペイロード

const responseLock = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadLock,
}).then((res) => res.json())

console.log({ responseLock })

const hashLock = facade.hashTransaction(txLock)

await awaitTransactionStatus(hashLock.toString(), NODE_URL, "confirmed");

//ロックTxが全ノードに伝播されるまで少し時間を置く
await new Promise((resolve) => setTimeout(resolve, 1000)); //1秒待機

//アグリゲートボンデッドトランザクションのアナウンス
const responseAgg = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadAgg,
}).then((res) => res.json())

console.log({ responseAgg })

//部分承認状態（partial）になることを確認
await awaitTransactionStatus(hashAgg.toString(), NODE_URL, "partial");
