// トランザクションを生成するコード
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"
import dotenv from "dotenv"

// dotenvの設定
dotenv.config()

//Symbolへ接続するためのノードを指定
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
//秘密鍵からのアカウント復元
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

const transferDescriptor =
  // descriptorはSymbol上のトランザクションやオブジェクトの識別子
  new descriptors.TransferTransactionV1Descriptor( // 転送トランザクション
    accountB.address, // 送信先アカウントのアドレス
     // 送付するモザイクを敗列で指定
    [
      new descriptors.UnresolvedMosaicDescriptor(
        // 72C0212E67A08BCEはテストネットの基軸通貨のモザイクID
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(1000000n), // 1.000000xym
      ),
    ],
    "\0Hello, Symbol!", // メッセージ
  )

// トランザクションの生成
const tx = facade.createTransactionFromTypedDescriptor(
  transferDescriptor, // descriptorの指定
  accountA.publicKey, // 署名者の公開鍵
  100, // 手数料乗数、100は最大値
  60 * 60 * 2, // 有効期限(秒)
)

const signature = accountA.signTransaction(tx) // 署名
// ペイロードを生成しJson形式 => 文字列に整形したもの
const jsonPayload = facade.transactionFactory.static.attachSignature(
  tx, // トランザクションを指定
  signature, // 署名を指定
)

// ノードにアナウンスを行う
const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT", //書き込み時はPUTを指定する
  headers: { "Content-Type": "application/json" },
  body: jsonPayload, //整形されたペイロードを指定
}).then((res) => res.json())

console.log({ response })

// トランザクションハッシュの生成
const hash = facade.hashTransaction(tx)

console.log("===転送トランザクション===")

//　ノード上でのトランザクションの状態を一秒ごとに確認
console.log(`confirmed状態まで待機中..`)
await new Promise(async (resolve, reject) => {
  for (let i = 0; i < 100; i++) {
    await new Promise((res) => setTimeout(res, 1000))
    //トランザクションハッシュ値を指定して状態を確認
    const status = await fetch(
      new URL("/transactionStatus/" + hash, NODE_URL),
    ).then((res) => res.json())
    //トランザクションの状態がconfirmedになっていたら結果を表示させる
    if (status.group === "confirmed") {
      console.log("結果 ", status.code)
      console.log(`エクスプローラー`)
      console.log(`https://testnet.symbol.fyi/transactions/${hash}`)
      resolve({})
      return
    } else if (status.group === "failed") {
      console.log("結果　エラー ", status.code)
      resolve({})
      return
    }
  }
  reject(new Error("トランザクションが確認されませんでした。"))
})