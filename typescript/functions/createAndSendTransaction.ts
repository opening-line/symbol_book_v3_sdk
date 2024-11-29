import {
  Network,
  SymbolAccount,
  SymbolFacade,
} from "symbol-sdk/symbol"
import { awaitTransactionStatus } from "./awaitTransactionStatus"
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)

//descriptorからトランザクションの生成、署名、アナウンス、ステータスの確認まで行う関数
export async function createAndcreateAndSendTransaction(
  descriptor: any,
  signAccount: SymbolAccount,
  description: string,
) {
  const tx = facade.createTransactionFromTypedDescriptor(
    descriptor,
    signAccount.publicKey,
    100,
    60 * 60 * 2,
  )

  const signature = signAccount.signTransaction(tx)
  const jsonPayload =
    facade.transactionFactory.static.attachSignature(tx, signature)

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

export async function createAndSendTransaction(
  descriptor: any,
  signAccount: SymbolAccount,
  description: string,
) {
  const tx = facade.createTransactionFromTypedDescriptor(
    descriptor,
    signAccount.publicKey,
    100,
    60 * 60 * 2,
  )

  const signature = signAccount.signTransaction(tx)
  const jsonPayload =
    facade.transactionFactory.static.attachSignature(tx, signature)

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
