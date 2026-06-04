import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from bs4.element import Tag


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ETFS_DIR = DATA_DIR / "etfs"
CONFIG_FILE = ROOT / "etf_tickers.json"
FAILED_FILE = DATA_DIR / "failed-etfs.json"
MANIFEST_FILE = DATA_DIR / "etfs-manifest.json"
RANKING_SOURCE_FILE = DATA_DIR / "etfs-ranking-source.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 dividendos-pwa etf scraper",
}


def load_configs() -> list[dict]:
    configs = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    if len(sys.argv) == 1:
        return configs

    requested = {ticker.upper() for ticker in sys.argv[1:]}
    filtered = [config for config in configs if config["ticker"].upper() in requested]
    missing = sorted(requested - {config["ticker"].upper() for config in filtered})

    if missing:
        raise SystemExit(f"ETFs nao configurados: {', '.join(missing)}")

    return filtered


def fetch_json(url: str) -> dict:
    response = requests.get(url, timeout=30, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def fetch_html(url: str) -> str:
    response = requests.get(url, timeout=30, headers=HEADERS)
    response.raise_for_status()
    return response.text


def parse_currency_number(raw_value: str) -> float:
    cleaned = raw_value.replace("R$", "").replace(".", "").replace(",", ".").strip()
    return float(cleaned)


def parse_br_date(raw_value: str) -> str | None:
    raw_value = raw_value.strip()
    if not raw_value:
        return None

    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            parsed = datetime.strptime(raw_value, fmt)
            return parsed.date().isoformat()
        except ValueError:
            continue

    raise ValueError(f"Data invalida: {raw_value}")


def parse_b3_quote(html: str, ticker: str) -> tuple[str, float]:
    soup = BeautifulSoup(html, "html.parser")

    subtitle = soup.select_one(".asset__subtitle")
    info_items = soup.select(".asset__info__item")

    if not subtitle or not info_items:
        raise ValueError(f"Estrutura inesperada na pagina da B3 para {ticker}.")

    current_price = None
    for item in info_items:
        desc = item.select_one(".asset__info__desc")
        value = item.select_one(".asset__info__value")
        if not desc or not value:
            continue
        if desc.get_text(strip=True) == "Valor atual (R$)":
            current_price = parse_currency_number(value.get_text(strip=True))
            break

    if current_price is None:
        raise ValueError(f"Nao foi possivel localizar a cotacao atual de {ticker} na B3.")

    return subtitle.get_text(" ", strip=True), current_price


def fetch_investo_dividend_payload(page_url: str) -> dict:
    html = fetch_html(page_url)
    page_id_match = re.search(r"postid-(\d+)", html)

    if not page_id_match:
        raise ValueError(f"Nao foi possivel localizar o page_id da pagina {page_url}.")

    page_id = page_id_match.group(1)
    base_url = page_url.rstrip("/")
    host_prefix = base_url.split("/etf/")[0]
    api_url = f"{host_prefix}/wp-json/custom/v1/historico-dividendos?page_id={page_id}"
    return fetch_json(api_url)


def normalize_investo_dividends(payload: dict) -> list[dict]:
    raw_items = payload.get("dividendos", [])
    normalized = []

    for item in raw_items:
        amount = item.get("dividendo")
        if amount is None:
            continue

        normalized.append(
            {
                "comDate": item.get("data_com"),
                "exDate": item.get("data_ex"),
                "paymentDate": item.get("data_pagamento"),
                "type": "Rendimento",
                "valuePerShare": float(amount),
            }
        )

    normalized.sort(key=lambda item: (item.get("comDate") or "", item.get("paymentDate") or ""))
    return normalized


def normalize_buenavista_dividends(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    normalized = []

    for container in soup.select("div.tabcontent"):
        table = container.find("table")
        if not isinstance(table, Tag):
            continue

        rows = table.find_all("tr")
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            value_text = cells[3].get_text(" ", strip=True)
            if not value_text:
                continue

            normalized.append(
                {
                    "comDate": parse_br_date(cells[0].get_text(" ", strip=True)),
                    "exDate": parse_br_date(cells[1].get_text(" ", strip=True)),
                    "paymentDate": parse_br_date(cells[2].get_text(" ", strip=True)),
                    "type": "Rendimento",
                    "valuePerShare": parse_currency_number(value_text),
                }
            )

    normalized.sort(key=lambda item: (item.get("comDate") or "", item.get("paymentDate") or ""))
    return normalized


def parse_buenavista_page(html: str, ticker: str) -> tuple[str, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    title = ticker

    for heading in soup.find_all(["h1", "h2"]):
        text = heading.get_text(" ", strip=True)
        if not text or text == ticker:
            continue
        if "ETF" in text:
            title = text
            break

    frequency = None
    if re.search(r"renda mensal|proventos|pagamentos de dividendos", html, flags=re.IGNORECASE):
        frequency = "MENSAL"

    return title, frequency


def build_investo_payload(config: dict, b3_fund_name: str, current_price: float) -> dict:
    ticker = config["ticker"].upper()
    product = fetch_json(f"https://api.investoetf.com.br/api/produtos/{ticker}")
    dividends_payload = fetch_investo_dividend_payload(config["pageUrl"])
    dividends = normalize_investo_dividends(dividends_payload)

    if not dividends:
        raise ValueError(f"Nenhum rendimento confirmado foi encontrado para {ticker}.")

    return {
        "ticker": ticker,
        "fundName": b3_fund_name,
        "companyName": b3_fund_name,
        "currentPrice": current_price,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "distributionFrequency": product.get("periodicidadeDividendo"),
        "source": {
            "name": "Investo + B3",
            "url": config["pageUrl"],
            "quoteUrl": config["quoteUrl"],
            "dividendsUrl": config["pageUrl"],
        },
        "dividends": dividends,
    }


def build_buenavista_payload(config: dict, b3_fund_name: str, current_price: float) -> dict:
    ticker = config["ticker"].upper()
    page_html = fetch_html(config["pageUrl"])
    dividends_html = fetch_html(config["dividendsUrl"])
    page_fund_name, distribution_frequency = parse_buenavista_page(page_html, ticker)
    dividends = normalize_buenavista_dividends(dividends_html)

    if not dividends:
        raise ValueError(f"Nenhum rendimento confirmado foi encontrado para {ticker}.")

    fund_name = b3_fund_name if b3_fund_name != ticker else page_fund_name

    return {
        "ticker": ticker,
        "fundName": fund_name,
        "companyName": fund_name,
        "currentPrice": current_price,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "distributionFrequency": distribution_frequency,
        "source": {
            "name": "Buena Vista + B3",
            "url": config["pageUrl"],
            "quoteUrl": config["quoteUrl"],
            "dividendsUrl": config["dividendsUrl"],
        },
        "dividends": dividends,
    }


def build_etf_payload(config: dict) -> dict:
    ticker = config["ticker"].upper()
    quote_html = fetch_html(config["quoteUrl"])
    b3_fund_name, current_price = parse_b3_quote(quote_html, ticker)

    if config["provider"] == "investo":
        return build_investo_payload(config, b3_fund_name, current_price)

    if config["provider"] == "buenavista":
        return build_buenavista_payload(config, b3_fund_name, current_price)

    raise ValueError(f"Provider nao suportado: {config['provider']}")


def load_existing_files() -> list[dict]:
    if not ETFS_DIR.exists():
        return []

    funds = []
    for path in sorted(ETFS_DIR.glob("*.json")):
        try:
            funds.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return funds


def write_etf_file(etf_data: dict) -> None:
    ETFS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ETFS_DIR / f"{etf_data['ticker']}.json"
    output_path.write_text(
        json.dumps(etf_data, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def write_outputs(etfs: list[dict], featured_tickers: list[str]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    available_tickers = {item["ticker"] for item in etfs}

    manifest = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "featuredTickers": [ticker for ticker in featured_tickers if ticker in available_tickers],
        "tickers": {
            etf["ticker"]: {
                "companyName": etf.get("fundName", etf["ticker"]),
                "path": f"./data/etfs/{etf['ticker']}.json",
                "sourceUrl": etf["source"]["url"],
            }
            for etf in sorted(etfs, key=lambda item: item["ticker"])
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
            for etf in sorted(etfs, key=lambda item: item["ticker"])
        ],
    }

    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    RANKING_SOURCE_FILE.write_text(
        json.dumps(ranking_source, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    configs = load_configs()
    all_featured_tickers = [
        item["ticker"].upper()
        for item in json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    ]
    existing = {item["ticker"]: item for item in load_existing_files()}
    failures = []

    for config in configs:
        ticker = config["ticker"].upper()
        try:
            etf_data = build_etf_payload(config)
            write_etf_file(etf_data)
            existing[ticker] = etf_data
            print(f"Atualizado {ticker}")
        except Exception as exc:
            failures.append({"ticker": ticker, "error": str(exc)})
            print(f"Falhou {ticker}: {exc}", file=sys.stderr)

    write_outputs(list(existing.values()), all_featured_tickers)
    FAILED_FILE.write_text(
        json.dumps(
            {
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "failures": failures,
            },
            ensure_ascii=True,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Manifesto de ETFs atualizado com {len(existing)} item(ns).")
    print(f"Falhas registradas: {len(failures)}.")


if __name__ == "__main__":
    main()
