// モザイクを生成し送付するコード
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
  generateMosaicId,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { 
  awaitTransactionStatus,
} from "../functions/awaitTransactionStatus"
import { 
  convertHexValuesInObject,
} from "../functions/convertHexValuesInObject"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

//モザイク定義用のフラグ値
const mosaicFlagsValue = models.MosaicFlags.TRANSFERABLE.value //第三者に転送可能
//モザイクID生成時のノンスの生成
const nonce = Math.floor(Math.random() * 0xffffffff)
//モザイクIDの生成
const id = generateMosaicId(accountA.address, nonce)

const mosaicDefinitionDescriptor =
  // モザイク定義トランザクション
  new descriptors.MosaicDefinitionTransactionV1Descriptor(
    new models.MosaicId(id), // モザイクID
    new models.BlockDuration(0n), // 有効期限
    new models.MosaicNonce(nonce), // ナンス
    new models.MosaicFlags(mosaicFlagsValue), // モザイク定義用のフラグ
    0, // 可分性 小数点以下の桁数
  )

const mosaicSupplyChangeDescriptor =
  // モザイク供給量変更トランザクション
  new descriptors.MosaicSupplyChangeTransactionV1Descriptor(
    new models.UnresolvedMosaicId(id), // モザイクID
    new models.Amount(100n), // 供給量
    // 増やす(INCREASE)減らす(DECREASE)
    models.MosaicSupplyChangeAction.INCREASE,
  )

const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address, // 送信先アカウントのアドレス
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(id), // 生成したモザイクID
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

// ３つのトランザクションを配列にする
const innerTransactions = txs.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction, // descriptorの指定
    tx.signer, // 署名者の公開鍵
    // その他のパラメータはアグリゲートトランザクション側で指定する
  ),
)

// インナー（アグリゲートに内包する）トランザクションのハッシュを生成
const innerTransactionHash =
  SymbolFacade.hashEmbeddedTransactions(innerTransactions)

const aggregateDescriptor =
  // アグリゲートトランザクション
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHash, //インナートランザクションのハッシュを指定
    innerTransactions, //インナートランザクションを指定
  )

// アグリゲートトランザクションの生成
const txAgg = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptor, // descriptorの指定
  accountA.publicKey, // 署名者の公開鍵
  100, // 手数料乗数はアグリゲートトランザクション側で指定する
  60 * 60 * 2, // 有効期限はアグリゲートトランザクション側で指定する
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

console.log("===モザイク発行及び転送トランザクション===")

// トランザクションの状態を確認する処理を関数化
await awaitTransactionStatus(
  hashAgg.toString(),
  NODE_URL,
  "confirmed",
)

//モザイク情報を取得する
const mosaicIdHex = new models.MosaicId(id)
  .toString()
  .replace("0x", "")
const mosaicInfo = await fetch(
  new URL("/mosaics/" + mosaicIdHex, NODE_URL),
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  },
).then((res) => res.json())

console.log(
  JSON.stringify(convertHexValuesInObject(mosaicInfo), null, 2),
)
