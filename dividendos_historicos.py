import locale
import sys
from datetime import datetime
from io import StringIO

import pandas as pd
import requests
from bs4 import BeautifulSoup


def print_usage() -> None:
    print("Uso: python dividendos_historicos.py <ticker> <anos> <percentual>")
    print("Exemplo: python dividendos_historicos.py PETR4 5 6")


def set_pt_br_locale() -> None:
    try:
        locale.setlocale(locale.LC_ALL, "pt_BR.UTF-8")
    except locale.Error:
        # O locale pode não existir no sistema; o script continua sem formatação local.
        pass


def parse_args() -> tuple[str, int, int]:
    if len(sys.argv) != 4:
        print_usage()
        raise SystemExit(1)

    ticker = sys.argv[1].upper()

    try:
        num_years = int(sys.argv[2])
        percent = int(sys.argv[3])
    except ValueError as exc:
        raise SystemExit("Os argumentos <anos> e <percentual> devem ser inteiros.") from exc

    if num_years <= 0:
        raise SystemExit("O argumento <anos> deve ser maior que zero.")

    if percent <= 0:
        raise SystemExit("O argumento <percentual> deve ser maior que zero.")

    return ticker, num_years, percent


def fetch_dividends_table(ticker: str) -> pd.DataFrame:
    url = f"https://www.dadosdemercado.com.br/bolsa/acoes/{ticker}/dividendos"
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.content, "html.parser")
    page_content = str(soup).replace(",", ".")
    tables = pd.read_html(StringIO(page_content))

    if not tables:
        raise ValueError(f"Nenhuma tabela de dividendos foi encontrada para {ticker}.")

    df = tables[0].copy()

    if "Registro" not in df.columns or "Valor" not in df.columns:
        raise ValueError("A tabela encontrada nao possui as colunas esperadas: Registro e Valor.")

    df["Registro"] = pd.to_datetime(df["Registro"], dayfirst=True, errors="coerce")
    df["Valor"] = pd.to_numeric(df["Valor"], errors="coerce")
    df = df.dropna(subset=["Registro", "Valor"])

    if df.empty:
        raise ValueError(f"Nao foi possivel extrair dados validos de dividendos para {ticker}.")

    return df


def filter_years(df: pd.DataFrame, num_years: int) -> pd.DataFrame:
    current_year = datetime.now().year
    min_year = current_year - num_years
    return df[df["Registro"].dt.year >= min_year].copy()


def main() -> None:
    ticker, num_years, percent = parse_args()
    set_pt_br_locale()

    try:
        df = fetch_dividends_table(ticker)
    except requests.RequestException as exc:
        raise SystemExit(f"Erro ao buscar dados para {ticker}: {exc}") from exc
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    df = filter_years(df, num_years)

    if df.empty:
        raise SystemExit(f"Nao existem dados de dividendos para {ticker} nos ultimos {num_years} anos.")

    proventos_por_ano = df.groupby(df["Registro"].dt.year)["Valor"].sum().sort_index()

    print(f"Serie historica de proventos nos ultimos {num_years} anos:")
    print(proventos_por_ano)

    total_proventos = df["Valor"].sum()
    num_anos = df["Registro"].dt.year.nunique()
    media_proventos = total_proventos / num_anos
    valor_final = (media_proventos * 100) / percent

    print(f"\nTotal de proventos nos ultimos {num_years} anos: {total_proventos:.4f}")
    print(f"Media de proventos nos ultimos {num_years} anos: {media_proventos:.4f}")
    print(f"Valor final: {valor_final:.4f}")


if __name__ == "__main__":
    main()
