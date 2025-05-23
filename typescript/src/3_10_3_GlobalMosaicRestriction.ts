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
import { waitTxStatus } from "./waitTxStatus"
import { createAndSendTx } from "./createAndSendTx"
import { sendTransferFees } from "./sendTransferFees"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
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

const feeAmount = 60000000n; // 60xym
const recipientAddresses = [
  allowedAccount1.address,
];

console.log("===事前手数料転送トランザクション===");
// 手数料を送付するトランザクションを生成、署名、アナウンス
const hashPre = await sendTransferFees(accountA, recipientAddresses, feeAmount);

await waitTxStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

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
    // 参照するモザイクID。制限対象のモザイクIDと同じ場合は0
    new models.UnresolvedMosaicId(0n),
    restrictionKey, // グローバルモザイク制限のキー
    0n, // キーに対する現在の値（初回は0）
    1n, // キーに対する新しい値
    models.MosaicRestrictionType.NONE, // 値を比較する現在のタイプ（初回はNONE）
    // 値を比較する新しいタイプ（EQは同じ値であれば許可）
    models.MosaicRestrictionType.EQ, 
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

const innerTxsGmr = txsGmr.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashGmr = SymbolFacade.hashEmbeddedTransactions(
  innerTxsGmr,
)

const aggregateDescriptorGmr =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashGmr,
    innerTxsGmr,
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

console.log("===制限付きモザイク発行及び転送トランザクション===")
console.log("アナウンス開始")
const responseGmr = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadGmr,
}).then((res) => res.json())

console.log("アナウンス結果", responseGmr)

const hashGmr = facade.hashTransaction(txGmr)

await waitTxStatus(
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
    0xFFFFFFFFFFFFFFFFn, // 現在の値　、初回は 0xFFFFFFFFFFFFFFFF
    1n, // 新しい値（比較タイプがEQで値が1なので許可）
    allowedAccount1.address, // 発行者自身にも設定しないと送受信できない
  )

// allowedAccount2に送受信の許可を適応
const mosaicAddressRestrictionDescriptor2 =
  new descriptors.MosaicAddressRestrictionTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id),
    restrictionKey,
    0xFFFFFFFFFFFFFFFFn,
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

const innerTxsMar = txsMar.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashMar = SymbolFacade.hashEmbeddedTransactions(
  innerTxsMar,
)

const aggregateDescriptorMar =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashMar,
    innerTxsMar,
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

console.log("===制限付きモザイクの送受信許可トランザクション===")
console.log("アナウンス開始")
const responseMar = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMar,
}).then((res) => res.json())

console.log("アナウンス結果", responseMar)

const hashMar = facade.hashTransaction(txMar)

await waitTxStatus(
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

console.log(
  "===制限付きモザイクが許可されたアカウントへの転送トランザクション===",
)
const hashTf1 = await createAndSendTx(
  transferDescriptor1,
  allowedAccount1,
)

await waitTxStatus(
  hashTf1.toString(),
  NODE_URL,
  "confirmed",
)

// allowedAccount1からnotAllowedAccount1への制限モザイクの送付
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

console.log(
  "===制限付きモザイクが許可されてないアカウントへの転送トランザクション===",
)
console.log("承認結果がSuccessではなくFailure_xxxになれば成功")
const hashTf2 = await createAndSendTx(
  transferDescriptor2,
  allowedAccount1,
)

await waitTxStatus(
  hashTf2.toString(),
  NODE_URL,
  "confirmed",
)
