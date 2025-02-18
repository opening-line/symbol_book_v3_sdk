// アカウントに対する制限を設定するコード
import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import {
  waitTransactionStatus,
  createAndSendTransaction,
} from "./functions"
import { sendTransferFees } from "./functions/sendTransferFees"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// 事前アカウント生成
const restrictedAccount1 = facade.createAccount(PrivateKey.random())
const restrictedAccount2 = facade.createAccount(PrivateKey.random())
const restrictedAccount3 = facade.createAccount(PrivateKey.random())

console.log(
  "Restricted Account 1 Address:",
  restrictedAccount1.address.toString(),
)
console.log(
  "Restricted Account 2 Address:",
  restrictedAccount2.address.toString(),
)
console.log(
  "Restricted Account 3 Address:",
  restrictedAccount3.address.toString(),
)

const feeAmount = 1000000n; // 1xym
const recipientAddresses = [
  restrictedAccount1.address,
  restrictedAccount2.address,
  restrictedAccount3.address
];

console.log("===事前手数料転送トランザクション===");
// 手数料を送付するトランザクションを生成、署名、アナウンス
const hashPre = await sendTransferFees(accountA, recipientAddresses, feeAmount);

await waitTransactionStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のアドレスからの受信禁止制限フラグ値
// (restrictedAccount1に対してaccountAからの受信を禁止)
const blockIncomingAddressFlagValue =
  new models.AccountRestrictionFlags(
    models.AccountRestrictionFlags.ADDRESS.value | // 制限対象 アカウント
      models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否
  )

const accountAddressRestrictionDescriptor =
  // アカウント制限トランザクション
  new descriptors.AccountAddressRestrictionTransactionV1Descriptor(
    blockIncomingAddressFlagValue, // フラグの指定
    [
      accountA.address, // 対象アドレスリスト（署名するアカウントではない事に注意）
    ],
    [], // 解除対象アドレスリスト
  )

console.log("===アカウント受信禁止トランザクション===")
const hashRr1 = await createAndSendTransaction(
  accountAddressRestrictionDescriptor,
  restrictedAccount1,
)

await waitTransactionStatus(
  hashRr1.toString(),
  NODE_URL,
  "confirmed",
)

// アカウント受信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor1 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount1.address,
    [],
    "\0Hello, restrictedAccount1!",
  )

console.log("===確認用アカウント受信禁止トランザクション===")
console.log("承認結果がSuccessではなくFailure_xxxになれば成功")
const hashTf1 = await createAndSendTransaction(
  transferDescriptor1,
  accountA,
)

await waitTransactionStatus(
  hashTf1.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のモザイクの受信禁止制限フラグ値
// (restrictedAccount2に対してxymの受信を禁止)
const blockMosaicFlagsValue = new models.AccountRestrictionFlags(
  models.AccountRestrictionFlags.MOSAIC_ID.value | // 制限対象 モザイク
    models.AccountRestrictionFlags.BLOCK.value, // 制限内容 拒否
)

const accountMosaicRestrictionDescriptor =
  // モザイク制限トランザクション
  new descriptors.AccountMosaicRestrictionTransactionV1Descriptor(
    blockMosaicFlagsValue, // フラグの指定
    [
      new models.UnresolvedMosaicId(0x72C0212E67A08BCEn), // 対象モザイクリスト
    ],
    [], // 解除対象モザイクリスト
  )
  
console.log("===モザイク受信禁止トランザクション===")
const hashRr2 = await createAndSendTransaction(
  accountMosaicRestrictionDescriptor,
  restrictedAccount2,
)

await waitTransactionStatus(
  hashRr2.toString(),
  NODE_URL,
  "confirmed",
)

// モザイク受信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor2 =
  new descriptors.TransferTransactionV1Descriptor(
    restrictedAccount2.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(10000000n), // 10xym
      ),
    ],
  )

console.log("===確認用モザイク受信禁止トランザクション===")
console.log("承認結果がSuccessではなくFailure_xxxになれば成功")
const hashTf2 = await createAndSendTransaction(
  transferDescriptor2,
  accountA,
)

await waitTransactionStatus(
  hashTf2.toString(),
  NODE_URL,
  "confirmed",
)

// 特定のトランザクションの送信禁止制限フラグ
// (restrictedAccount3の転送トランザクションの送信を禁止)
const accountOperationRestrictionFlagsValue =
  new models.AccountRestrictionFlags(
    // 制限対象 トランザクションタイプ
    models.AccountRestrictionFlags.TRANSACTION_TYPE.value | 
      models.AccountRestrictionFlags.BLOCK.value | // 制限内容 拒否
      models.AccountRestrictionFlags.OUTGOING.value, // 制限の方向 送信のみ
  )

const accountOperationRestrictionDescriptor =
  // トランザクション制限トランザクション
  new descriptors.AccountOperationRestrictionTransactionV1Descriptor(
    accountOperationRestrictionFlagsValue, // フラグの指定
    [
      models.TransactionType.TRANSFER.value, // 対象のトランザクションタイプリスト
    ],
    [], // 解除対象のトランザクションタイプリスト
  )

console.log("===トランザクション送信禁止トランザクション===")
const hashRr3 = await createAndSendTransaction(
  accountOperationRestrictionDescriptor,
  restrictedAccount3,
)

await waitTransactionStatus(
  hashRr3.toString(),
  NODE_URL,
  "confirmed",
)

// トランザクション送信禁止トランザクションの確認
// 制限がかかりエラーになることを確認する
const transferDescriptor3 =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Hello, accountA!",
  )
  
console.log("===確認用トランザクション送信禁止トランザクション===")
console.log("承認結果がSuccessではなくFailure_xxxになれば成功")
const hashTf3 = await createAndSendTransaction(
  transferDescriptor3,
  restrictedAccount3,
)

await waitTransactionStatus(
  hashTf3.toString(),
  NODE_URL,
  "confirmed",
)
