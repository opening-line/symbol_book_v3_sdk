//トランザクションハッシュを指定してトランザクションの状態を確認する関数
export async function awaitTransactionStatus(
  hash: string,
  nodeUrl: string,
  transactionStatus: "confirmed" | "unconfirmed" | "partial",
) {
  console.log(`${transactionStatus}状態まで待機中..`)
  await new Promise(async (resolve, reject) => {
    for (let i = 0; i < 100; i++) {
      await new Promise((res) => setTimeout(res, 1000))
      //トランザクションハッシュからステータスを確認
      const status = await fetch(
        new URL("/transactionStatus/" + hash, nodeUrl),
        {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        }        
      ).then((res) => res.json())
      //指定したトランザクションステータスになっていたら結果を表示させる
      if (status.group === transactionStatus) {
        console.log("結果 ", status.code, "エクスプローラー ", `https://testnet.symbol.fyi/transactions/${hash}`)
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
}
