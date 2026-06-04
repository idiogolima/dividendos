# dividendos

[![PWA Pronto](https://img.shields.io/badge/PWA-Pronto-brightgreen?style=for-the-badge&logo=pwa)](https://idiogolima.github.io/dividendos/)
[![Hospedado no GitHub Pages](https://img.shields.io/badge/Hospedado_no-GitHub_Pages-blue?style=for-the-badge&logo=github)](https://idiogolima.github.io/dividendos/)

Aplicativo web em HTML, CSS e JavaScript para calcular o preco teto de acoes brasileiras como PWA no GitHub Pages.

O app consome arquivos JSON locais versionados no repositório.

## Links

- Repositorio: https://github.com/idiogolima/dividendos
- GitHub Pages: https://idiogolima.github.io/dividendos/

Se a URL do GitHub Pages ainda nao abrir, ative a publicacao em `Settings > Pages` no repositorio e aguarde o deploy inicial.

## Objetivo

Calcular o preco teto da acao pela formula:

```text
preco teto = media anual de dividendos x 100 / retorno alvo
```

Exemplo:

- media anual de dividendos: `R$ 1,20`
- retorno alvo: `6%`
- preco teto: `R$ 20,00`

## Modos de uso

- [`index.html`](index.html): pagina inicial para escolha dos fluxos
- [`acoes.html`](acoes.html): consulta individual por ticker de acao
- [`acoes-ranking.html`](acoes-ranking.html): ranking em lote de acoes
- [`etfs.html`](etfs.html): consulta individual por ETF distribuidor
- [`etfs-ranking.html`](etfs-ranking.html): ranking em lote de ETFs distribuidores

## Como funciona

1. O script de atualizacao busca os dados de cada ticker
2. Extrai preco atual, nome da empresa e historico de dividendos/JCP
3. Salva tudo em `data/stocks/<TICKER>.json`
4. Atualiza `data/manifest.json`
5. O app em [`index.html`](index.html) carrega esses arquivos locais

## Por que esse modelo

O GitHub Pages serve apenas arquivos estaticos. Por isso, o app le somente arquivos locais do próprio repositório.

Por isso, a arquitetura correta aqui e:

- scraper no repositório
- JSON versionado em `data/`
- frontend lendo apenas arquivos locais

## Estrutura principal

- [`index.html`](index.html): pagina inicial
- [`acoes.html`](acoes.html): consulta individual de acoes
- [`app.js`](app.js): interface e calculo do preco teto para acoes
- [`acoes-ranking.html`](acoes-ranking.html): ranking de acoes
- [`ranking.js`](ranking.js): ranking de acoes
- [`etfs.html`](etfs.html): consulta individual de ETFs distribuidores
- [`etf-app.js`](etf-app.js): interface e calculo do preco teto para ETFs
- [`etfs-ranking.html`](etfs-ranking.html): ranking de ETFs
- [`etf-ranking.js`](etf-ranking.js): ranking de ETFs
- [`styles.css`](styles.css): visual do app
- [`service-worker.js`](service-worker.js): cache do PWA
- [`manifest.webmanifest`](manifest.webmanifest): manifesto instalavel
- [`scripts/update_playinvest_data.py`](scripts/update_playinvest_data.py): gerador dos JSONs locais
- [`playinvest_tickers.json`](playinvest_tickers.json): lista de tickers a atualizar
- [`scripts/update_investo_etf_data.py`](scripts/update_investo_etf_data.py): gerador dos JSONs locais de ETFs
- [`etf_tickers.json`](etf_tickers.json): lista de ETFs distribuidores suportados
- [`data/manifest.json`](data/manifest.json): manifesto dos dados gerados
- [`data/etfs-manifest.json`](data/etfs-manifest.json): manifesto dos ETFs gerados
- [`scripts/update_data_local.sh`](scripts/update_data_local.sh): atalho para atualizar e preparar o envio

## Tickers iniciais

O projeto ja esta configurado com:

- `BAZA3`
- `PETR4`
- `VALE3`
- `ITUB4`
- `BBAS3`

## Rodar localmente

Crie a virtualenv e instale as dependencias do scraper:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Para atualizar os dados:

```bash
python scripts/update_playinvest_data.py
```

Para atualizar os ETFs:

```bash
python scripts/update_investo_etf_data.py
```

Para atualizar apenas tickers especificos:

```bash
python scripts/update_playinvest_data.py BAZA3 PETR4
```

Para abrir o app localmente:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

Fluxos disponiveis:

- `http://localhost:8000/`: pagina inicial
- `http://localhost:8000/acoes.html`: acoes
- `http://localhost:8000/etfs.html`: ETFs distribuidores

## Atualizacao local rapida

Depois de criar a `.venv`, o fluxo mais simples e:

```bash
./scripts/update_data_local.sh
```

Para atualizar apenas tickers especificos:

```bash
./scripts/update_data_local.sh BAZA3 PETR4
```

O script:

- executa a atualizacao dos JSONs
- mostra o `git status` dos arquivos de dados
- imprime os comandos finais para commit e push

## Publicar no GitHub Pages

1. Envie os commits com `git push origin main`
2. Abra `Settings > Pages`
3. Escolha `Deploy from a branch`
4. Selecione `main` e `/ (root)`
5. Salve

URL esperada:

```text
https://idiogolima.github.io/dividendos/
```

## Dependencias

As dependencias em [`requirements.txt`](requirements.txt) existem para o scraper e para o script Python legado.

## Publicacao dos JSONs

Depois de atualizar:

```bash
git add data/ playinvest_tickers.json
git commit -m "Atualiza dados locais"
git push origin main
```
