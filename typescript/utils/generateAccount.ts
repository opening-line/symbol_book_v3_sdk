// アカウントを生成するコード
import { PrivateKey } from "symbol-sdk"
import { SymbolFacade, Network } from "symbol-sdk/symbol"

const facade = new SymbolFacade(Network.TESTNET) //SymbolSDKの機能を呼び出す窓口
const account = facade.createAccount(PrivateKey.random()) //新規アカウントの生成
const address = account.address.toString() //アドレスの導出

console.log("秘密鍵", account.keyPair.privateKey.toString()) //秘密鍵の導出
//フォーセットへのURLを表示
console.log(
  "フォーセット",
  `https://testnet.symbol.tools/?recipient=${address}`, 
)
//エクスプローラーへのURLを表示
console.log(
  "エクスプローラー",
  `https://testnet.symbol.fyi/accounts/${address}`,
)
