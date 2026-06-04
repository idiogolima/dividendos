import json
import re
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
TICKERS_FILE = ROOT / "playinvest_tickers.json"
SOURCE_URL = "https://playinvest.com.br/script/stocksarr"


def fetch_stockarr() -> str:
    response = requests.get(
        SOURCE_URL,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 dividendos-pwa ticker updater"},
    )
    response.raise_for_status()
    return response.text


def parse_tickers(payload: str) -> list[str]:
    match = re.search(r"var\s+stockarr\s*=\s*(\[.*\]);?\s*$", payload, flags=re.DOTALL)
    if not match:
        raise ValueError("Nao foi possivel localizar o array stockarr.")

    items = json.loads(match.group(1))
    tickers = []
    seen = set()

    for item in items:
        symbol = str(item.get("symbol", "")).strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        tickers.append(symbol)

    tickers.sort()
    return tickers


def main() -> None:
    payload = fetch_stockarr()
    tickers = parse_tickers(payload)
    TICKERS_FILE.write_text(json.dumps(tickers, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"Lista atualizada com {len(tickers)} ticker(s).")


if __name__ == "__main__":
    main()
