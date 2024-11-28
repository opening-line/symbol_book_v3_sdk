import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
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

// 事前アカウント作成
const restrictedAccount1 = facade.createAccount(PrivateKey.random())
const restrictedAccount2 = facade.createAccount(PrivateKey.random())
const restrictedAccount3 = facade.createAccount(PrivateKey.random())

console.log(
  "Address of restricted account 1:",
  restrictedAccount1.address.toString(),
)
console.log(
  "Address of restricted account 2:",
  restrictedAccount2.address.toString(),
)
console.log(
  "Address of restricted account 3:",
  restrictedAccount3.address.toString(),
)

// 転送トランザクション1（手数料分のxym送付）
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount1.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(10000000n), // 10xym
      ),
    ],
  )

// 転送トランザクション2（手数料分のxym送付）
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount2.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(10000000n), // 10xym
      ),
    ],
  )

// 転送トランザクション3（手数料分のxym送付）
const transferDescriptor3 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount3.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(10000000n), // 10xym
      ),
    ],
  )

const txsPre = [
  {
    transaction: transferDescriptor1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptor2,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptor3,
    signer: accountA.publicKey,
  },
]

const innerTransactionsPre = txsPre.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashPre = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsPre,
)

const aggregateDescriptorPre =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashPre,
    innerTransactionsPre,
  )

const txPre = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptorPre,
  accountA.publicKey,
  100,
  60 * 60 * 2,
)

const signaturePre = accountA.signTransaction(txPre) // 署名
const jsonPayloadPre =
  facade.transactionFactory.static.attachSignature(
    txPre,
    signaturePre,
  ) // ペイロード

const responsePre = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadPre,
}).then((res) => res.json())

console.log({ responsePre })

const hashPre = facade.hashTransaction(txPre)

console.log("===事前手数料転送トランザクション===")
await awaitTransactionStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のアドレスからの受信禁止制限フラグ(accountAからの受信を禁止)
const flagBlockIncomingAddress = new models.AccountRestrictionFlags(
  models.AccountRestrictionFlags.ADDRESS.value + // 制限対象 アカウント
    models.AccountRestrictionFlags.BLOCK.value // 制限内容 拒否 （許可の場合はフラグの追加は不要）
    // 制限の方向 受信 (受信の場合はフラグの追加は不要)
)

// 転送トランザクション
const accountAddressRestrictionDescriptor =
  new descriptors.AccountAddressRestrictionTransactionV1Descriptor(
    flagBlockIncomingAddress, // フラグの指定
    [       
      accountA.address, // 対象アドレス（制限をかけるアカウントでなく、制限対象のアドレス）
    ],
    [] // 解除対象アドレス  
  )

const txRr1 = facade.createTransactionFromTypedDescriptor(
  accountAddressRestrictionDescriptor,
  restrictedAccount1.publicKey, // 設定アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signatureRr1 = restrictedAccount1.signTransaction(txRr1) // 署名
const jsonPayloadRr1 = facade.transactionFactory.static.attachSignature(
  txRr1,
  signatureRr1,
) // ペイロード

const responseRr1 = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadRr1,
}).then((res) => res.json())

console.log({ responseRr1 })

const hashRr1 = facade.hashTransaction(txRr1)

console.log("===アカウント受信禁止トランザクション===")
await awaitTransactionStatus(hashRr1.toString(), NODE_URL, "confirmed")



