export async function awaitTransactionStatus(hash: string, nodeUrl: string, transactionStatus: 'confirmed' | 'unconfirmed' | 'partial') {
    //トランザクションの状態を確認できる
    console.log(`トランザクションステータス`);
    console.log(`${nodeUrl}/transactionStatus/${hash}`);

    // Txが指定したステータス状態になるまで待つ
    console.log(`${transactionStatus}状態まで待機中..`);
    await new Promise(async (resolve, reject) => {
        for (let i = 0; i < 100; i++) {
            await new Promise((res) => setTimeout(res, 1000));
            const status = await fetch(
                new URL("/transactionStatus/" + hash, nodeUrl),
            ).then((res) => res.json());
            if (status.group === transactionStatus) {
                resolve({});
                return; // 確認された場合は早期リターン
            }
        }
        reject(new Error("トランザクションが確認されませんでした。")); // エラーメッセージを追加
    });

    console.log(`エクスプローラー`);
    console.log(`https://testnet.symbol.fyi/transactions/${hash}`);
}
