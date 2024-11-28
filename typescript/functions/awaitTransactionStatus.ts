export async function awaitTransactionStatus(
  hash: string,
  nodeUrl: string,
  transactionStatus: "confirmed" | "unconfirmed" | "partial",
) {
  // Txが指定したステータス状態になるまで待つ
  console.log(`${transactionStatus}状態まで待機中..`)
  await new Promise(async (resolve, reject) => {
    for (let i = 0; i < 100; i++) {
      await new Promise((res) => setTimeout(res, 1000))
      const status = await fetch(
        new URL("/transactionStatus/" + hash, nodeUrl),
      ).then((res) => res.json())
      if (status.group === transactionStatus) {
        console.log("結果 ", status.code)
        console.log(`エクスプローラー`)
        console.log(`https://testnet.symbol.fyi/transactions/${hash}`)
        resolve({}) // 確認された場合は終了
        return
      } else if (
        status.group === "failed" ||
        status.code == "ResourceNotFound"
      ) {
        console.log("エラー ", status.code)
        resolve({})
        return // エラーを検知した場合は終了
      }
    }
    reject(new Error("トランザクションが確認されませんでした。"))
  })
}
