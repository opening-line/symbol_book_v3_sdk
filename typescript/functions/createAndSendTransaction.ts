import {
  Network,
  SymbolAccount,
  SymbolFacade,
} from "symbol-sdk/symbol"
import type { Hash256 } from "symbol-sdk"
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)

//descriptorからトランザクションの生成、署名、アナウンスを行う関数
export async function createAndSendTransaction(
  descriptor: any,
  signAccount: SymbolAccount
): Promise<Hash256> {
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

  return facade.hashTransaction(tx)
}
