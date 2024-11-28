import { PrivateKey } from "symbol-sdk"
import { Network, SymbolFacade, descriptors, models } from "symbol-sdk/symbol"

import dotenv from "dotenv"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// WebSocketクライアントの作成
const wsEndpoint = NODE_URL.replace("http", "ws") + "/ws"
let uid = ""
const funcs: { [key: string]: Function[] } = {}

// チャンネルへのコールバック追加
const addCallback = (channel: string, callback: Function): void => {
  funcs[channel] = funcs[channel] || []
  funcs[channel].push(callback)
}

// WebSocket接続とエラーハンドリング
const connectWebSocket = () => {
  const listener = new WebSocket(wsEndpoint)

  listener.onopen = () => {
    console.log("WebSocket Connected")
    if (uid) {
      ;[confirmedChannelName, unconfirmedChannelName].forEach((channel) => {
        listener.send(JSON.stringify({ uid, subscribe: channel }))
      })
    }
  }

  listener.onmessage = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      if (data.uid) {
        uid = data.uid
        console.log("Received UID:", uid)
        ;[confirmedChannelName, unconfirmedChannelName].forEach((channel) => {
          listener.send(JSON.stringify({ uid, subscribe: channel }))
        })
        return
      }
      funcs[data.topic]?.forEach((f) => f(data.data))
    } catch (error) {
      console.error("Error processing message:", error)
    }
  }

  listener.onerror = (error: Event) => console.error("WebSocket Error:", error)
  listener.onclose = (closeEvent: CloseEvent) => {
    console.log("WebSocket Closed:", closeEvent)
    uid = ""
    Object.keys(funcs).forEach((key) => delete funcs[key])
  }

  return listener
}

// コールバックの設定
const confirmedChannelName = `confirmedAdded/${accountA.address}`
const unconfirmedChannelName = `unconfirmedAdded/${accountA.address}`
addCallback(confirmedChannelName, (tx) => console.log("confirmed added", tx))
addCallback(unconfirmedChannelName, (tx) =>
  console.log("unconfirmed added", tx),
)

// WebSocket接続を開始
connectWebSocket()

const message = "\0Hello, Symbol!" // \0はエクスプローラーやデスクトップウォレットで識別するためのフラグ

// 転送トランザクション
const transferDescriptor = new descriptors.TransferTransactionV1Descriptor(
  accountB.address,
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
      new models.Amount(1000000n),
    ),
  ],
  message,
)

const tx = facade.createTransactionFromTypedDescriptor(
  transferDescriptor,
  accountA.publicKey,
  100,
  60 * 60 * 2,
)

const signature = accountA.signTransaction(tx)
const jsonPayload = facade.transactionFactory.static.attachSignature(
  tx,
  signature,
)

const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayload,
}).then((res) => res.json())

console.log({ response })
