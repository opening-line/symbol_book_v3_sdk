import {
  Address,
  Network,
  SymbolAccount,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"
import type { Hash256 } from "symbol-sdk"
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)

//手数料を送付するトランザクションの生成、署名、アナウンスを行う関数
export async function sendTransferFees(
  signAccount: SymbolAccount,
  recipientAddresses: Address[],
  feeAmount: bigint
): Promise<Hash256> {
  const transferDescriptors = recipientAddresses.map(address =>
    new descriptors.TransferTransactionV1Descriptor(
      address,
      [
        new descriptors.UnresolvedMosaicDescriptor(
          new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
          new models.Amount(feeAmount), // 指定された手数料
        ),
      ],
    )
  );

  const txsPre = transferDescriptors.map(descriptor => ({
    transaction: descriptor,
    signer: signAccount.publicKey,
  }));

  const innerTransactionsPre = txsPre.map((tx) =>
    facade.createEmbeddedTransactionFromTypedDescriptor(
      tx.transaction,
      tx.signer,
    ),
  );

  const innerTransactionHashPre = SymbolFacade.hashEmbeddedTransactions(
    innerTransactionsPre,
  );

  const aggregateDescriptorPre =
    new descriptors.AggregateCompleteTransactionV2Descriptor(
      innerTransactionHashPre,
      innerTransactionsPre,
    );

  const txPre = facade.createTransactionFromTypedDescriptor(
    aggregateDescriptorPre,
    signAccount.publicKey,
    100,
    60 * 60 * 2,
  );

  const signaturePre = signAccount.signTransaction(txPre);
  const jsonPayloadPre =
    facade.transactionFactory.static.attachSignature(
      txPre,
      signaturePre,
    );

  const responsePre = await fetch(new URL("/transactions", NODE_URL), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: jsonPayloadPre,
  }).then((res) => res.json());

  console.log("===事前手数料転送トランザクション===");
  console.log("アナウンス結果", responsePre);

  return facade.hashTransaction(txPre);
}
