// アカウントに対する制限を設定するコード
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { 
  awaitTransactionStatus,
} from "../functions/awaitTransactionStatus"
import { 
  createAndSendTransaction,
} from "../functions/createAndSendTransaction"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// 事前アカウント生成
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

// 転送トランザクション1
// （アカウント制限に必要な手数料を送付）
const transferDescriptorPre1 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount1.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
      ),
    ],
  )

// 転送トランザクション2
// （アカウント制限に必要な手数料を送付）
const transferDescriptorPre2 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount2.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
      ),
    ],
  )

// 転送トランザクション3
// （アカウント制限に必要な手数料を送付）
const transferDescriptorPre3 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount3.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
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

const signaturePre = accountA.signTransaction(txPre)
const jsonPayloadPre =
  facade.transactionFactory.static.attachSignature(
    txPre,
    signaturePre,
  )

const responsePre = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadPre,
}).then((res) => res.json())

console.log("===事前手数料転送トランザクション===")
console.log("アナウンス結果", responsePre)

const hashPre = facade.hashTransaction(txPre)

await awaitTransactionStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のアドレスからの受信禁止制限フラグ値
// (restrictedAccount1に対してaccountAからの受信を禁止)
const blockIncomingAddressFlagValue =
  new models.AccountRestrictionFlags(
    models.AccountRestrictionFlags.ADDRESS.value | // 制限対象 アカウント
      models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否
  )

const accountAddressRestrictionDescriptor =
  // アカウント制限トランザクション
  new descriptors.AccountAddressRestrictionTransactionV1Descriptor(
    blockIncomingAddressFlagValue, // フラグの指定
    [
      accountA.address, // 対象アドレスリスト（署名するアカウントではない事に注意）
    ],
    [], // 解除対象アドレスリスç
  )

console.log("===アカウント受信禁止トランザクション===")
const hashRr1 = await createAndSendTransaction(
  accountAddressRestrictionDescriptor,
  restrictedAccount1,
)

await awaitTransactionStatus(
  hashRr1.toString(),
  NODE_URL,
  "confirmed",
)

// アカウント受信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount1.address,
    [],
    "\0Hello, restrictedAccount1!",
  )

console.log("===確認用アカウント受信禁止トランザクション===")
const hashTf1 = await createAndSendTransaction(
  transferDescriptor1,
  accountA,
)

await awaitTransactionStatus(
  hashTf1.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のモザイクの受信禁止制限フラグ値
// (restrictedAccount2に対してxymの受信を禁止)
const blockMosaicFlagsValue = new models.AccountRestrictionFlags(
  models.AccountRestrictionFlags.MOSAIC_ID.value | // 制限対象 モザイク
    models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否
)

const accountMosaicRestrictionDescriptor =
  // モザイク制限トランザクション
  new descriptors.AccountMosaicRestrictionTransactionV1Descriptor(
    blockMosaicFlagsValue, // フラグの指定
    [
      new models.UnresolvedMosaicId(0x72C0212E67A08BCEn), // 対象モザイクリスト
    ],
    [], // 解除対象モザイクリスト
  )

console.log("===モザイク受信禁止トランザクション===")
const hashRr2 = await createAndSendTransaction(
  accountMosaicRestrictionDescriptor,
  restrictedAccount2,
)

await awaitTransactionStatus(
  hashRr2.toString(),
  NODE_URL,
  "confirmed",
)

// モザイク受信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount2.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(10000000n), // 10xym
      ),
    ],
  )

console.log("===確認用モザイク受信禁止トランザクション===") 
const hashTf2 = await createAndSendTransaction(
  transferDescriptor2,
  accountA,
)

await awaitTransactionStatus(
  hashTf2.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のトランザクションの送信禁止制限フラグ
// (restrictedAccount3の転送トランザクションの送信を禁止)
const accountOperationRestrictionFlagsValue =
  new models.AccountRestrictionFlags(
    // 制限対象 トランザクションタイプ
    models.AccountRestrictionFlags.TRANSACTION_TYPE.value | 
      models.AccountRestrictionFlags.BLOCK.value | // 制限内容 拒否
      models.AccountRestrictionFlags.OUTGOING.value, // 制限の方向 送信のみ
  )

const accountOperationRestrictionDescriptor =
  // トランザクション制限トランザクション
  new descriptors.AccountOperationRestrictionTransactionV1Descriptor(
    accountOperationRestrictionFlagsValue, // フラグの指定
    [
      models.TransactionType.TRANSFER.value, // 対象のトランザクションタイプリスト
    ],
    [], // 解除対象のトランザクションタイプリスト
  )

console.log("===トランザクション送信禁止トランザクション===")
const hashRr3 = await createAndSendTransaction(
  accountOperationRestrictionDescriptor,
  restrictedAccount3,
)

await awaitTransactionStatus(
  hashRr3.toString(),
  NODE_URL,
  "confirmed",
)

// トランザクション送信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor3 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Hello, accountA!",
  )

console.log("===確認用トランザクション送信禁止トランザクション===")  
const hashTf3 = await createAndSendTransaction(
  transferDescriptor3,
  restrictedAccount3,
)

await awaitTransactionStatus(
  hashTf3.toString(),
  NODE_URL,
  "confirmed",
)
