import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ETFS_DIR = DATA_DIR / "etfs"
CONFIG_FILE = ROOT / "etf_tickers.json"
MANIFEST_FILE = DATA_DIR / "etfs-manifest.json"
RANKING_SOURCE_FILE = DATA_DIR / "etfs-ranking-source.json"


def main() -> None:
    configs = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    featured_tickers = [item["ticker"].upper() for item in configs]
    etfs = []

    for path in sorted(ETFS_DIR.glob("*.json")):
        etfs.append(json.loads(path.read_text(encoding="utf-8")))

    manifest = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "featuredTickers": [ticker for ticker in featured_tickers if ticker in {item["ticker"] for item in etfs}],
        "tickers": {
            etf["ticker"]: {
                "companyName": etf.get("fundName", etf["ticker"]),
                "path": f"./data/etfs/{etf['ticker']}.json",
                "sourceUrl": etf.get("source", {}).get("url"),
            }
            for etf in etfs
        },
    }

    ranking_source = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "stocks": [
            {
                "ticker": etf["ticker"],
                "fundName": etf.get("fundName", etf["ticker"]),
                "companyName": etf.get("fundName", etf["ticker"]),
                "currentPrice": etf.get("currentPrice", 0),
                "updatedAt": etf.get("updatedAt"),
                "dividends": etf.get("dividends", []),
            }
            for etf in etfs
        ],
    }

    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    RANKING_SOURCE_FILE.write_text(
        json.dumps(ranking_source, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Manifesto de ETFs reconstruido com {len(etfs)} item(ns).")


if __name__ == "__main__":
    main()
