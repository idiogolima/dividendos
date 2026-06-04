#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_PYTHON="$ROOT_DIR/.venv/bin/python"
UPDATER="$ROOT_DIR/scripts/update_investo_etf_data.py"

if [ ! -x "$VENV_PYTHON" ]; then
  echo "Virtualenv nao encontrada em $ROOT_DIR/.venv"
  echo "Crie com:"
  echo "  python3 -m venv .venv"
  echo "  source .venv/bin/activate"
  echo "  pip install -r requirements.txt"
  exit 1
fi

cd "$ROOT_DIR"

echo "Atualizando JSONs locais de ETFs..."
"$VENV_PYTHON" "$UPDATER" "$@"

echo
echo "Arquivos alterados:"
git status --short data etf_tickers.json

echo
echo "Proximos passos:"
echo '  git add data/ etf_tickers.json'
echo '  git commit -m "Atualiza dados locais de ETFs"'
echo '  git push origin main'
