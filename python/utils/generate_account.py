# アカウントを生成するコード
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
    SymbolFacade,
    SymbolAccount,
)


def main() -> None:
    facade: SymbolFacade = SymbolFacade(
        "testnet"
    )  # SymbolSDKの機能を呼び出す窓口
    account: SymbolAccount = facade.create_account(
        PrivateKey.random()
    )  # 新規アカウントの生成

    print("秘密鍵", str(account.key_pair.private_key))  # 秘密鍵の導出
    # フォーセットへのURLを表示
    print(
        "フォーセット",
        f"https://testnet.symbol.tools/?recipient={account.address}",  # アドレスの導出
    )
    # エクスプローラーへのURLを表示
    print(
        "エクスプローラー",
        f"https://testnet.symbol.fyi/accounts/{account.address}",  # アドレスの導出
    )


if __name__ == "__main__":
    main()
