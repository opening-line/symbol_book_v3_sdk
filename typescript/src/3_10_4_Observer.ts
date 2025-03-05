// WebSocketを使ったトランザクションステータスの監視を行うコード
import { PrivateKey } from "symbol-sdk"
import { Network, SymbolFacade, descriptors } from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { createAndSendTx } from "./createAndSendTx"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// WebSocket接続の管理
const initializeWebSocket = async () => {
  // WebSocketクライアントの生成
  const wsEndpoint = NODE_URL.replace("http", "ws") + "/ws"
  const ws = new WebSocket(wsEndpoint)

  // WebSocketに接続した時の処理
  ws.addEventListener("open", async () => {    
    // 接続時のレスポンスからUIDを取得
    const uid = await new Promise((resolve) => {
      ws.addEventListener("message", (event: MessageEvent) => {
        const message = JSON.parse(event.data)
        if (message.uid) {
          console.log("接続ID:", message.uid)
          resolve(message.uid)
        }
      })
    })

    // チャンネル設定
    const confirmedChannelName = 
      `confirmedAdded/${accountA.address}`
    const unconfirmedChannelName = 
      `unconfirmedAdded/${accountA.address}`

    // チャンネル購読
    ws.send(
      JSON.stringify(
        { uid: uid, subscribe: confirmedChannelName }
      ))
    ws.send(
      JSON.stringify(
        { uid: uid, subscribe: unconfirmedChannelName }
      ))
  })

  // WebSocketでメッセージを検知した時の処理
  ws.addEventListener("message", (event: MessageEvent) => {
    const message = JSON.parse(event.data)
    const topic = message.topic || "";
    const tx = message.data

    // 承認済みトランザクションを検知した時の処理
    if (topic.startsWith("confirmedAdded")) {
      console.log("承認トランザクション検知:", tx)
      const hash = tx.meta.hash
      const height = tx.meta.height      
      console.log("トランザクションハッシュ",hash)
      console.log("ブロック高",height)
      console.log("Symbolエクスプローラー ",
        `https://testnet.symbol.fyi/transactions/${hash}`,
      )        
      ws.close()
    }
    // 未承認済みトランザクションを検知した時の処理
    else if (topic.startsWith("unconfirmedAdded")) {
      console.log("未承認トランザクション検知:", tx)
    }
  })

  // WebSocketでエラーを検知した時の処理
  ws.addEventListener("error", (event) => {
    console.error("WebSocketエラー:", event)
  })

  // WebSocketが閉じた時の処理
  ws.addEventListener("close", () => {
    console.log("WebSocket接続終了")
  })

  return ws
}

// 監視で検知させるための転送トランザクション
const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [],
    "\0Hello, accountB!",
  )

// WebSocket開始
await initializeWebSocket()
// 接続が確立するまで1秒待つ
await new Promise((resolve) => setTimeout(resolve, 1000))
// トランザクション送信
await createAndSendTx(transferDescriptor, accountA)
