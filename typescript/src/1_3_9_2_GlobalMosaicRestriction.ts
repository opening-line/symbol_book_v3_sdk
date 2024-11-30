// モザイクに対する制限（グローバルモザイク制限）を設定するコード
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
import { awaitTransactionStatus } from "../functions/awaitTransactionStatus"
import { createAndSendTransaction } from "../functions/createAndSendTransaction"

dotenv.config()

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

// 転送トランザクション
// （制限付きモザイクの作成に関わる必要な手数料を送付）
const transferDescriptorPre =
  new descriptors.TransferTransactionV1Descriptor(
    allowedAccount1.address, 
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(60000000n), // 60xym
      ),
    ],
  )

const hashPre = await createAndSendTransaction(
  transferDescriptorPre,
  accountA
)

console.log("===事前手数料転送トランザクション===")
await awaitTransactionStatus(hashPre.toString(), NODE_URL, "confirmed")

//モザイク定義用のフラグ値（制限付きモザイクを許可）
const mosaicFlagsValue =
  models.MosaicFlags.TRANSFERABLE.value | // 第三者に転送可能
  models.MosaicFlags.RESTRICTABLE.value // グローバルモザイク制限を許可

const nonce = Math.floor(Math.random() * 0xffffffff)
const id = generateMosaicId(allowedAccount1.address, nonce)

const mosaicDefinitionDescriptor =
  new descriptors.MosaicDefinitionTransactionV1Descriptor(
    new models.MosaicId(id),
    new models.BlockDuration(0n),    
    new models.MosaicNonce(nonce),
    new models.MosaicFlags(mosaicFlagsValue),
    0,
  )

const mosaicSupplyChangeDescriptor =
  new descriptors.MosaicSupplyChangeTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id),
    new models.Amount(100n),
    models.MosaicSupplyChangeAction.INCREASE,
  )

// グローバルモザイク制限用のキーワードの生成
// モザイクごとにユニークである必要がある
const keyText = "kyc"
const restrictionKey = metadataGenerateKey(keyText) // bigIntに変換

const mosaicGlobalRestrictionDescriptor =
  // グローバルモザイク制限トランザクション
  new descriptors.MosaicGlobalRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // 制限対象のモザイクID
    new models.UnresolvedMosaicId(0n), // 参照するモザイクID。制限対象のモザイクIDと同じ場合は0
    restrictionKey, // グローバルモザイク制限のキー
    0n, // キーに対する現在の値（初回は0）
    1n, // キーに対する新しい値
    models.MosaicRestrictionType.NONE, // 値を比較する現在のタイプ（初回はNONE）
    models.MosaicRestrictionType.EQ, // 値を比較する新しいタイプ（EQは同じ値であれば許可）
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

const signatureGmr = allowedAccount1.signTransaction(txGmr)
const jsonPayloadGmr =
  facade.transactionFactory.static.attachSignature(
    txGmr,
    signatureGmr,
  )

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

// allowedAccount1に送受信の許可を適応
const mosaicAddressRestrictionDescriptor1 =
  // モザイクの使用を許可/制限するアドレスとその制限値を設定するトランザクション
  new descriptors.MosaicAddressRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // 制限対象のモザイクID
    restrictionKey, // グローバルモザイク制限のキー
    0xffffffffffffffffn, // 現在の値　、初回は 0xFFFFFFFFFFFFFFFF
    1n, // 新しい値（比較タイプがEQで値が1なので許可）
    allowedAccount1.address, // 発行者自身にも設定しないと送受信できない
  )

// allowedAccount2に送受信の許可を適応
const mosaicAddressRestrictionDescriptor2 =
  new descriptors.MosaicAddressRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id),
    restrictionKey,
    0xffffffffffffffffn,
    1n,
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

const signatureMar = allowedAccount1.signTransaction(txMar)
const jsonPayloadMar =
  facade.transactionFactory.static.attachSignature(
    txMar,
    signatureMar,
  )

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
    allowedAccount2.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(id),
        new models.Amount(1n), 
      ),
    ],
  )

const hashTf1 = await createAndSendTransaction(
  transferDescriptor1,
  allowedAccount1
)

console.log("===制限付きモザイクが許可されたアカウントへの転送トランザクション===")
await awaitTransactionStatus(hashTf1.toString(), NODE_URL, "confirmed")

// allowedAccount1からallowedAccount3への制限モザイクの送付
// 制限がかかりエラーになることを確認する
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    notAllowedAccount1.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(id),
        new models.Amount(1n),
      ),
    ],
  )

const hashTf2 = await createAndSendTransaction(
  transferDescriptor2,
  allowedAccount1
)

console.log("===制限付きモザイクが許可されてないアカウントへの転送トランザクション===")
await awaitTransactionStatus(hashTf2.toString(), NODE_URL, "confirmed")