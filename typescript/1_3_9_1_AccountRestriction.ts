import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"
import { sendTransaction } from "./functions/sendTransaction"

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
  "Restricted Account 1 Address:",
  restrictedAccount1.address.toString(),
)
console.log(
  "Restricted Account 2 Address:",
  restrictedAccount2.address.toString(),
)
console.log(
  "Restricted Account 3 Address:",
  restrictedAccount3.address.toString(),
)

// 転送トランザクション1（手数料分のxym送付）
const transferDescriptorPre1 =
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
const transferDescriptorPre2 =
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
const transferDescriptorPre3 =
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
    transaction: transferDescriptorPre1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptorPre2,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptorPre3,
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

// 特定のアドレスからの受信禁止制限フラグ(restrictedAccount1に対してaccountAからの受信を禁止)
const blockIncomingAddressFlagValue =
  new models.AccountRestrictionFlags(
    models.AccountRestrictionFlags.ADDRESS.value | // 制限対象 アカウント
      models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否 （許可の場合はフラグの追加は不要）
    // 制限の方向 受信 (受信の場合はフラグの追加は不要)
  )

// アカウント制限トランザクション
const accountAddressRestrictionDescriptor =
  new descriptors.AccountAddressRestrictionTransactionV1Descriptor(
    blockIncomingAddressFlagValue, // フラグの指定
    [
      accountA.address, // 対象アドレス（制限をかけるアカウントでなく、制限対象のアドレス）
    ],
    [], // 解除対象アドレス
  )

const txRr1 = facade.createTransactionFromTypedDescriptor(
  accountAddressRestrictionDescriptor,
  restrictedAccount1.publicKey, // 設定アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signatureRr1 = restrictedAccount1.signTransaction(txRr1) // 署名
const jsonPayloadRr1 =
  facade.transactionFactory.static.attachSignature(
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
await awaitTransactionStatus(
  hashRr1.toString(),
  NODE_URL,
  "confirmed",
)

// アカウント受信禁止トランザクションの確認
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount1.address, // 送信先アカウントのアドレス
    [],
    "\0Hello, Symbol!",
  )

await sendTransaction(
  transferDescriptor1,
  accountA,
  "アカウント受信禁止確認用トランザクション",
)

// 特定のモザイクの受信禁止制限フラグ(restrictedAccount2に対してxymの受信を禁止)
const blockMosaicFlagsValue = new models.AccountRestrictionFlags(
  models.AccountRestrictionFlags.MOSAIC_ID.value | // 制限対象 モザイク
    models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否 （許可の場合はフラグの追加は不要）
  // 制限の方向 受信のみ
)

// モザイク制限トランザクション
const accountMosaicRestrictionDescriptor =
  new descriptors.AccountMosaicRestrictionTransactionV1Descriptor(
    blockMosaicFlagsValue, // フラグの指定
    [
      // 設定モザイク
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
    ],
    [], // 解除対象モザイク
  )

const txRr2 = facade.createTransactionFromTypedDescriptor(
  accountMosaicRestrictionDescriptor,
  restrictedAccount2.publicKey, // 設定アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signatureRr2 = restrictedAccount2.signTransaction(txRr2) // 署名
const jsonPayloadRr2 =
  facade.transactionFactory.static.attachSignature(
    txRr2,
    signatureRr2,
  ) // ペイロード

const responseRr2 = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadRr2,
}).then((res) => res.json())

console.log({ responseRr2 })

const hashRr2 = facade.hashTransaction(txRr2)

console.log("===モザイク受信禁止トランザクション===")
await awaitTransactionStatus(
  hashRr2.toString(),
  NODE_URL,
  "confirmed",
)

// モザイク受信禁止トランザクションの確認
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

await sendTransaction(
  transferDescriptor2,
  accountA,
  "モザイク受信禁止確認用トランザクション",
)

// 特定のトランザクションの送信禁止制限フラグ(restrictedAccount3の転送トランザクションの送信を禁止)
const accountOperationRestrictionFlagsValue =
  new models.AccountRestrictionFlags(
    models.AccountRestrictionFlags.TRANSACTION_TYPE.value | // 制限対象 モザイク
      models.AccountRestrictionFlags.BLOCK.value | // 制限内容 拒否 （許可の場合はフラグの追加は不要）
      models.AccountRestrictionFlags.OUTGOING.value, // 制限の方向 送信のみ
  )

// トランザクション制限トランザクション
const accountOperationRestrictionDescriptor =
  new descriptors.AccountOperationRestrictionTransactionV1Descriptor(
    accountOperationRestrictionFlagsValue, // フラグの指定
    [
      // トランザクションタイプの設定
      models.TransactionType.TRANSFER.value,
    ],
    [], // 解除対象のトランザクションタイプ
  )

const txRr3 = facade.createTransactionFromTypedDescriptor(
  accountOperationRestrictionDescriptor,
  restrictedAccount3.publicKey, // 設定アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signatureRr3 = restrictedAccount3.signTransaction(txRr3) // 署名
const jsonPayloadRr3 =
  facade.transactionFactory.static.attachSignature(
    txRr3,
    signatureRr3,
  ) // ペイロード

const responseRr3 = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadRr3,
}).then((res) => res.json())

console.log({ responseRr3 })

const hashRr3 = facade.hashTransaction(txRr3)

console.log("===トランザクション送信禁止トランザクション===")
await awaitTransactionStatus(
  hashRr3.toString(),
  NODE_URL,
  "confirmed",
)

// トランザクション送信禁止トランザクションの確認
const transferDescriptor3 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address, // 送信先アカウントのアドレス
    [],
    "\0Hello, Symbol!",
  )

await sendTransaction(
  transferDescriptor3,
  restrictedAccount3,
  "トランザクション送信禁止確認用トランザクション",
)
