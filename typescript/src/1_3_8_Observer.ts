// WebSocketを使ったトランザクションステータスの監視を行うコード
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { createAndSendTransaction } from "../functions/createAndSendTransaction"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// WebSocketクライアントの生成
const wsEndpoint = NODE_URL.replace("http", "ws") + "/ws"
let uid = ""
const subscriptions = new Map<string, Function[]>()

// サブスクリプション管理
const subscribe = (channel: string, callback: Function): void => {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, [])
  }
  subscriptions.get(channel)?.push(callback)
}

// チャンネル設定
const confirmedChannelName = `confirmedAdded/${accountA.address}`
const unconfirmedChannelName = `unconfirmedAdded/${accountA.address}`

subscribe(confirmedChannelName, (tx: any) => {
  //承認済みトランザクションを検知した時の処理
  console.log("承認済みトランザクション:", tx)
  console.log("結果 Success", "エクスプローラー ", `https://testnet.symbol.fyi/transactions/${tx.meta.hash}`)
})
subscribe(unconfirmedChannelName, (tx: any) =>{
  //承認済みトランザクションを検知した時の処理
  console.log("未承認済みトランザクション:", tx)
})
// WebSocket接続の管理
const initializeWebSocket = () => {
  const ws = new WebSocket(wsEndpoint)

  // WebSocketに接続した時の処理
  ws.addEventListener("open", () => {
    console.log("WebSocket接続確立")
  })

  // WebSocketでメッセージを検知した時の処理
  ws.addEventListener("message", (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data)

      // UIDの初期処理
      if (message.uid) {
        uid = message.uid
        console.log("接続ID:", uid)
        // チャンネル購読
        ws.send(JSON.stringify({ uid, subscribe: confirmedChannelName }));
        ws.send(JSON.stringify({ uid, subscribe: unconfirmedChannelName }));
        return
      }

      // 購読チャンネルからのメッセージ処理
      const handlers = subscriptions.get(message.topic)
      handlers?.forEach((handler) => {
        handler(message.data)
        // confirmedAddedを検知したらWebSocketを切る処理
        if (message.topic === confirmedChannelName) {
          ws.close()
        }
      })
    } catch (err) {
      console.error("メッセージ処理エラー:", err)
    }
  })

  // WebSocketでエラーを検知した時の処理
  ws.addEventListener("error", (event) => {
    console.error("WebSocketエラー:", event)
  })

  // WebSocketが閉じた時の処理
  ws.addEventListener("close", () => {
    console.log("WebSocket接続終了")
    uid = ""
    subscriptions.clear()
  })

  return ws
}

// WebSocket開始
initializeWebSocket()

// 接続が確立するまで1秒待つ
await new Promise((resolve) => setTimeout(resolve, 1000))

// 監視で検知させるための転送トランザクション
const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [],
    "\0Hello, accountB!",
  )

await createAndSendTransaction(
  transferDescriptor,
  accountA
)