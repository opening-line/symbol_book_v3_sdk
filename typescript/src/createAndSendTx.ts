import {
  Network,
  SymbolAccount,
  SymbolFacade,
} from "symbol-sdk/symbol"
import type { Hash256 } from "symbol-sdk"
import dotenv from "dotenv"

dotenv.config()
const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)

//descriptorからトランザクションの生成、署名、アナウンスを行う関数
export async function createAndSendTx(
  descriptor: any,
  signAccount: SymbolAccount,
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
    
  console.log("アナウンス開始")
  const response = await fetch(new URL("/transactions", NODE_URL), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayload,
  }).then((res) => res.json())

  console.log("アナウンス結果", response)

  return facade.hashTransaction(tx)
}
