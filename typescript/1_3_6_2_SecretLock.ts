import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import sha3 from "js-sha3"
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

const proof = crypto.getRandomValues(new Uint8Array(20)) // ロック解除用
// 16進数の文字列 Uint8に戻す場合は utils.hexToUint8を使う
const proofHex = utils.uint8ToHex(proof)

const hashObject = sha3.sha3_256.create()
hashObject.update(proof)

const secret = hashObject.digest() // ロック用
// 16進数の文字列 Uint8に戻す場合は utils.hexToUint8を使う
const secretHex = hashObject.hex()

console.log(proofHex)
console.log(secretHex)

// シークレットロックトランザクション作成/署名/アナウンス
const secretLock1Descriptor =
  new descriptors.SecretLockTransactionV1Descriptor(
    accountB.address, // 解除先のアドレス
    secret as unknown as models.Hash256, // ロック用
    new descriptors.UnresolvedMosaicDescriptor(
      // ロックしておくモザイクを指定
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen),
      new models.Amount(1000000n),
    ),
    new models.BlockDuration(480n), // ロックしておくブロック数（1ブロック約30秒）
    models.LockHashAlgorithm.SHA3_256, // ロック生成に使用したアルゴリズム
  )

await sendTransaction(secretLock1Descriptor, accountA, "シークレットロックトランザクション")

// シークレットプルーフトランザクション作成/署名/
const proofDescriptor =
  new descriptors.SecretProofTransactionV1Descriptor(
    accountB.address, // 解除先のアドレス
    secret as unknown as models.Hash256, // ロック用
    models.LockHashAlgorithm.SHA3_256, // ロック生成に使用したアルゴリズム
    proof, // 解除用
  )

await sendTransaction(proofDescriptor, accountB, "シークレットプルーフトランザクション")
