import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STOCKS_DIR = DATA_DIR / "stocks"
TICKERS_FILE = ROOT / "playinvest_tickers.json"


def load_tickers() -> list[str]:
    if len(sys.argv) > 1:
        return [ticker.upper() for ticker in sys.argv[1:]]

    return json.loads(TICKERS_FILE.read_text(encoding="utf-8"))


def fetch_html(ticker: str) -> str:
    url = f"https://playinvest.com.br/dividendos/{ticker.lower()}"
    response = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 dividendos-pwa scraper"},
    )
    response.raise_for_status()
    return response.text


def parse_currency_number(raw_value: str) -> float:
    cleaned = raw_value.replace("R$", "").replace(".", "").replace(",", ".").strip()
    return float(cleaned)


def parse_iso_date(raw_value: str) -> str | None:
    raw_value = raw_value.strip()

    if raw_value == "----":
        return None

    parsed = datetime.strptime(raw_value, "%d/%m/%Y")
    return parsed.date().isoformat()


def parse_stock_page(ticker: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    symbol = soup.select_one(".stock-symbol-title")
    company_name = soup.select_one(".stock-name-title")
    investment_value = soup.select_one("#lblInvestmentValue")
    dividend_table = soup.select_one("#dividendTable")

    if not symbol or not company_name or not investment_value or not dividend_table:
        raise ValueError(f"Estrutura inesperada na pagina da PlayInvest para {ticker}.")

    dividends = []
    table_body = dividend_table.find("tbody")

    if not table_body:
        raise ValueError(f"Tabela de dividendos sem corpo para {ticker}.")

    for row in table_body.find_all("tr"):
        columns = row.find_all("td")
        if len(columns) < 5:
            continue

        value_label = columns[1].find("label")
        raw_numeric = columns[4].get_text(strip=True)
        raw_visible_value = value_label.get_text(strip=True) if value_label else columns[1].get_text(strip=True)

        dividends.append(
            {
                "comDate": parse_iso_date(columns[0].get_text(strip=True)),
                "paymentDate": parse_iso_date(columns[2].get_text(strip=True)),
                "type": columns[3].get_text(strip=True),
                "valuePerShare": float(raw_numeric) if raw_numeric else parse_currency_number(raw_visible_value),
            }
        )

    page_url = f"https://playinvest.com.br/dividendos/{ticker.lower()}"
    updated_match = re.search(r'"article:modified_time" content="([^"]+)"', html)
    updated_at = updated_match.group(1) if updated_match else datetime.now(timezone.utc).isoformat()

    return {
        "ticker": symbol.get_text(strip=True).upper(),
        "companyName": company_name.get_text(" ", strip=True),
        "currentPrice": parse_currency_number(investment_value.get_text(strip=True)),
        "source": {
            "name": "PlayInvest",
            "url": page_url,
        },
        "updatedAt": updated_at,
        "dividends": dividends,
    }


def write_stock_file(stock_data: dict) -> str:
    STOCKS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = STOCKS_DIR / f"{stock_data['ticker']}.json"
    output_path.write_text(
        json.dumps(stock_data, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return f"./data/stocks/{stock_data['ticker']}.json"


def write_manifest(stocks: list[dict], featured_tickers: list[str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "featuredTickers": featured_tickers,
        "tickers": {
            stock["ticker"]: {
                "companyName": stock["companyName"],
                "path": f"./data/stocks/{stock['ticker']}.json",
                "sourceUrl": stock["source"]["url"],
            }
            for stock in stocks
        },
    }

    (DATA_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    tickers = load_tickers()
    stocks = []

    for ticker in tickers:
        html = fetch_html(ticker)
        stock_data = parse_stock_page(ticker, html)
        write_stock_file(stock_data)
        stocks.append(stock_data)
        print(f"Atualizado {ticker}")

    write_manifest(stocks, featured_tickers=tickers)
    print(f"Manifesto atualizado com {len(stocks)} ticker(s).")


if __name__ == "__main__":
    main()
