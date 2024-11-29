import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { sendTransaction } from "./functions/sendTransaction"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// WebSocketクライアントの作成
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

// WebSocket接続の管理
const initializeWebSocket = () => {
  const ws = new WebSocket(wsEndpoint)

  ws.addEventListener("open", () => {
    console.log("WebSocket接続確立")
  })

  ws.addEventListener("message", (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data)

      // UIDの初期処理
      if (message.uid) {
        uid = message.uid
        console.log("接続ID:", uid)

        // チャンネル購読
        const channels = [
          confirmedChannelName,
          unconfirmedChannelName,
        ]
        channels.forEach((channel) => {
          ws.send(
            JSON.stringify({
              uid,
              subscribe: channel,
            }),
          )
        })
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

  ws.addEventListener("error", (event) => {
    console.error("WebSocketエラー:", event)
  })

  ws.addEventListener("close", () => {
    console.log("WebSocket接続終了")
    uid = ""
    subscriptions.clear()
  })

  return ws
}

// チャンネル設定
const confirmedChannelName = `confirmedAdded/${accountA.address}`
const unconfirmedChannelName = `unconfirmedAdded/${accountA.address}`

subscribe(confirmedChannelName, (tx: any) =>
  console.log("承認済みトランザクション:", tx),
)
subscribe(unconfirmedChannelName, (tx: any) =>
  console.log("未承認トランザクション:", tx),
)

// WebSocket開始
initializeWebSocket()

// 接続が確立するまで1秒待つ
await new Promise((resolve) => setTimeout(resolve, 1000))

// 監視確認用トランザクション
const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountB.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
        new models.Amount(1000000n),
      ),
    ],
    "\0Hello, Symbol!",
  )

await sendTransaction(
  transferDescriptor,
  accountA,
  "監視確認用トランザクション",
)
