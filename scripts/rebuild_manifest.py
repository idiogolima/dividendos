import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STOCKS_DIR = DATA_DIR / "stocks"
TICKERS_FILE = ROOT / "playinvest_tickers.json"
MANIFEST_FILE = DATA_DIR / "manifest.json"
RANKING_SOURCE_FILE = DATA_DIR / "ranking-source.json"


def main() -> None:
    featured_tickers = json.loads(TICKERS_FILE.read_text(encoding="utf-8"))
    tickers = {}
    ranking_stocks = []

    for path in sorted(STOCKS_DIR.glob("*.json")):
        stock = json.loads(path.read_text(encoding="utf-8"))
        tickers[stock["ticker"]] = {
            "companyName": stock.get("companyName", stock["ticker"]),
            "path": f"./data/stocks/{stock['ticker']}.json",
        }
        ranking_stocks.append(
            {
                "ticker": stock["ticker"],
                "companyName": stock.get("companyName", stock["ticker"]),
                "currentPrice": stock.get("currentPrice", 0),
                "updatedAt": stock.get("updatedAt"),
                "dividends": stock.get("dividends", []),
            }
        )

    manifest = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "featuredTickers": [ticker for ticker in featured_tickers if ticker in tickers][:24],
        "tickers": tickers,
    }

    MANIFEST_FILE.write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    RANKING_SOURCE_FILE.write_text(
        json.dumps(
            {
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "stocks": ranking_stocks,
            },
            ensure_ascii=True,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Manifesto reconstruido com {len(tickers)} ticker(s).")


if __name__ == "__main__":
    main()
