import {
  Network,
  SymbolAccount,
  SymbolFacade,
  descriptors,
} from "symbol-sdk/symbol"
import { awaitTransactionStatus } from "./awaitTransactionStatus" // 必要なインポートを追加

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)

export async function sendTransaction(
  descriptor: any,
  signAccount: SymbolAccount,
  description: string,
) {
  const tx = facade.createTransactionFromTypedDescriptor(
    descriptor,
    signAccount.publicKey, // 送信元アカウントの公開鍵
    100,
    60 * 60 * 2,
  )

  const signature = signAccount.signTransaction(tx) // 署名
  const jsonPayload =
    facade.transactionFactory.static.attachSignature(tx, signature) // ペイロード

  const response = await fetch(new URL("/transactions", NODE_URL), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayload,
  }).then((res) => res.json())

  console.log({ response })

  const hash = facade.hashTransaction(tx)

  console.log(`===${description}===`)
  await awaitTransactionStatus(hash.toString(), NODE_URL, "confirmed")
}
