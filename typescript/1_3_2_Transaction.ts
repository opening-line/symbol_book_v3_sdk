import { PrivateKey } from "symbol-sdk"
import { Network, SymbolFacade, descriptors, models } from "symbol-sdk/symbol"
import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

const message = "\0Hello, Symbol!" // \0はエクスプローラーやデスクトップウォレットで識別するためのフラグ

// 転送トランザクション
const transferDescriptor = new descriptors.TransferTransactionV1Descriptor(
  accountB.address, // 送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), // テストネットの基軸通貨のモザイクID
      new models.Amount(1000000n), // 1xym
    ),
  ],
  message, // メッセージ
)

const tx = facade.createTransactionFromTypedDescriptor(
  transferDescriptor,
  accountA.publicKey, // 送信元アカウントの公開鍵
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
