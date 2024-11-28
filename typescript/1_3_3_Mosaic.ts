import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
  generateMosaicId,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https:// sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

const mosaicFlagsValue = {
  supplyMutable: 0,
  transferable: 1,
  restrictable: 0,
  revokable: 0,
}

const nonce = Math.floor(Math.random() * 0xffffffff)
const id = generateMosaicId(accountA.address, nonce)

// モザイク定義トランザクションの作成
const mosaicDefinitionDescriptor =
  new descriptors.MosaicDefinitionTransactionV1Descriptor(
    new models.MosaicId(id), // モザイクID
    new models.BlockDuration(0n), // 有効期限
    new models.MosaicNonce(nonce), // モザイクナンス
    new models.MosaicFlags(mosaicFlagsValue), // モザイク設定
    0, // divisibility(過分性、小数点以下の桁数)
  )

const amount = 100

// モザイク供給量変更トランザクションの作成
const mosaicSupplyChangeDescriptor =
  new descriptors.MosaicSupplyChangeTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // モザイクID
    new models.Amount(BigInt(amount)), // 供給量
    models.MosaicSupplyChangeAction.INCREASE, // 供給量変更アクション（0: Decrease, 1: Increase）
  )

// 転送トランザクション
const transferDescriptor = new descriptors.TransferTransactionV1Descriptor(
  accountB.address, // 送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(id), // 作成したモザイクID
      new models.Amount(1n), // 1mosaic
    ),
  ],
)

const txs = [
  {
    transaction: mosaicDefinitionDescriptor,
    signer: accountA.publicKey,
  },
  {
    transaction: mosaicSupplyChangeDescriptor,
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

const tx = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptor,
  accountA.publicKey,
  100,
  60 * 60 * 2,
)

const signature = accountA.signTransaction(tx) // 署名
const jsonPayload = facade.transactionFactory.static.attachSignature(
  tx,
  signature,
) // ペイロード

const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayload,
}).then((res) => res.json())

console.log({ response })

const hash = facade.hashTransaction(tx)

await awaitTransactionStatus(hash.toString(), NODE_URL, "confirmed")
