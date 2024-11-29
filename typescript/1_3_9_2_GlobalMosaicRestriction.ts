import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  generateMosaicId,
  metadataGenerateKey,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"
import { createAndSendTransaction } from "./functions/createAndSendTransaction"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// 事前アカウント生成
const allowedAccount1 = facade.createAccount(PrivateKey.random())
const allowedAccount2 = facade.createAccount(PrivateKey.random())
const notAllowedAccount1 = facade.createAccount(PrivateKey.random())

console.log(
  "Allowed Account 1 Address:",
  allowedAccount1.address.toString(),
)
console.log(
  "Allowed Account 2 Address:",
  allowedAccount2.address.toString(),
)
console.log(
  "Not Allowed Account 1 Address:",
  notAllowedAccount1.address.toString(),
)

// 転送トランザクション（手数料分のxym送付）
const transferDescriptorPre =
  new descriptors.TransferTransactionV1Descriptor(
    allowedAccount1.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(100000000n), // 100xym
      ),
    ],
  )

await createAndSendTransaction(
  transferDescriptorPre,
  accountA,
  "事前手数料転送トランザクション",
)

//allowedAccount1による制限付きモザイクの生成

const mosaicFlagsValue =
  models.MosaicFlags.TRANSFERABLE.value | // 第三者に転送可能にするか
  models.MosaicFlags.RESTRICTABLE.value // グローバルモザイク制限を許可するか

const nonce = Math.floor(Math.random() * 0xffffffff)
const id = generateMosaicId(allowedAccount1.address, nonce)

// モザイク定義トランザクションの生成
const mosaicDefinitionDescriptor =
  new descriptors.MosaicDefinitionTransactionV1Descriptor(
    new models.MosaicId(id), // モザイクID
    new models.BlockDuration(0n), // 有効期限
    new models.MosaicNonce(nonce), // モザイクナンス
    new models.MosaicFlags(mosaicFlagsValue), // モザイク設定
    0, // divisibility(過分性、小数点以下の桁数)
  )

// モザイク供給量変更トランザクションの生成
const mosaicSupplyChangeDescriptor =
  new descriptors.MosaicSupplyChangeTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // モザイクID
    new models.Amount(100n), // 供給量
    models.MosaicSupplyChangeAction.INCREASE, // 供給量変更アクション（0: Decrease, 1: Increase）
  )

// グローバルモザイク制限に必要なキーワードの生成、モザイクごとにユニークである必要がある
const keyText = "kyc"
// const keyText = "kyc" + Math.random().toString(36).substring(2, 7)
const restrictionKey = metadataGenerateKey(keyText) // bigIntに変換

// グローバルモザイク制限トランザクション
const mosaicGlobalRestrictionDescriptor =
  new descriptors.MosaicGlobalRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // 制限対象のモザイクID
    new models.UnresolvedMosaicId(0n), // 参照するモザイクID。制限対象のモザイクIDと同じ場合は0
    restrictionKey, // グローバルモザイク制限のキー
    0n, // 現在の値
    1n, // 新しい値
    models.MosaicRestrictionType.NONE, // 現在の制限の種類
    models.MosaicRestrictionType.EQ, // 新しい制限の種類
  )

const txsGmr = [
  {
    transaction: mosaicDefinitionDescriptor,
    signer: allowedAccount1.publicKey,
  },
  {
    transaction: mosaicSupplyChangeDescriptor,
    signer: allowedAccount1.publicKey,
  },
  {
    transaction: mosaicGlobalRestrictionDescriptor,
    signer: allowedAccount1.publicKey,
  },
]

const innerTransactionsGmr = txsGmr.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashGmr = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsGmr,
)

const aggregateDescriptorGmr =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashGmr,
    innerTransactionsGmr,
  )

const txGmr = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptorGmr,
  allowedAccount1.publicKey,
  100,
  60 * 60 * 2,
)

const signatureGmr = allowedAccount1.signTransaction(txGmr) // 署名
const jsonPayloadGmr =
  facade.transactionFactory.static.attachSignature(
    txGmr,
    signatureGmr,
  ) // ペイロード

const responseGmr = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadGmr,
}).then((res) => res.json())

console.log({ responseGmr })

const hashGmr = facade.hashTransaction(txGmr)

console.log("===制限付きモザイク発行及び転送トランザクション===")
await awaitTransactionStatus(
  hashGmr.toString(),
  NODE_URL,
  "confirmed",
)

// グローバルモザイク制限トランザクション

// allowedAccount1に送受信の許可を適応
const mosaicAddressRestrictionDescriptor1 =
  new descriptors.MosaicAddressRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // 制限対象のモザイクID
    restrictionKey, // グローバルモザイク制限のキー
    0xffffffffffffffffn, // 現在の値　、まだ適応されていない場合は 0xFFFFFFFFFFFFFFFF
    1n, // 新しい値
    allowedAccount1.address,
  )

// allowedAccount2に送受信の許可を適応
const mosaicAddressRestrictionDescriptor2 =
  new descriptors.MosaicAddressRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // 制限対象のモザイクID
    restrictionKey, // グローバルモザイク制限のキー
    0xffffffffffffffffn, // 現在の値　、まだ適応されていない場合は 0xFFFFFFFFFFFFFFFF
    1n, // 新しい値
    allowedAccount2.address,
  )

const txsMar = [
  {
    transaction: mosaicAddressRestrictionDescriptor1,
    signer: allowedAccount1.publicKey,
  },
  {
    transaction: mosaicAddressRestrictionDescriptor2,
    signer: allowedAccount1.publicKey,
  },
]

const innerTransactionsMar = txsMar.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashMar = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsMar,
)

const aggregateDescriptorMar =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashMar,
    innerTransactionsMar,
  )

const txMar = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptorMar,
  allowedAccount1.publicKey,
  100,
  60 * 60 * 2,
)

const signatureMar = allowedAccount1.signTransaction(txMar) // 署名
const jsonPayloadMar =
  facade.transactionFactory.static.attachSignature(
    txMar,
    signatureMar,
  ) // ペイロード

const responseMar = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMar,
}).then((res) => res.json())

console.log({ responseMar })

const hashMar = facade.hashTransaction(txMar)

console.log("===制限付きモザイクの送受信許可トランザクション===")
await awaitTransactionStatus(
  hashMar.toString(),
  NODE_URL,
  "confirmed",
)

// allowedAccount1からallowedAccount2への制限モザイクの送付
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    allowedAccount2.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(id),
        new models.Amount(1n), // 1モザイク
      ),
    ],
  )

await createAndSendTransaction(
  transferDescriptor1,
  allowedAccount1,
  "制限付きモザイクが許可されたアカウントへの転送トランザクション",
)

// allowedAccount1からallowedAccount3への制限モザイクの送付
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    notAllowedAccount1.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(id),
        new models.Amount(1n), // 1モザイク
      ),
    ],
  )

await createAndSendTransaction(
  transferDescriptor2,
  allowedAccount1,
  "制限付きモザイクが許可されてないアカウントへの転送トランザクション",
)
