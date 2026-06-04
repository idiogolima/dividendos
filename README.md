# dividendos

Aplicativo web em HTML, CSS e JavaScript para calcular o preco teto de acoes brasileiras como PWA no GitHub Pages.

O app nao consulta a PlayInvest diretamente no navegador. Em vez disso, um scraper em Python gera arquivos JSON locais a partir das paginas da PlayInvest, e o frontend consome esses arquivos estaticos.

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

## Como funciona

1. O scraper acessa paginas como `https://playinvest.com.br/dividendos/baza3`
2. Extrai preco atual, nome da empresa e historico de dividendos/JCP
3. Salva tudo em `data/stocks/<TICKER>.json`
4. Atualiza `data/manifest.json`
5. O app em [`index.html`](index.html) carrega esses arquivos locais

## Por que esse modelo

O GitHub Pages serve apenas arquivos estaticos. Como a PlayInvest nao libera CORS para leitura cross-origin no navegador, um `fetch` direto do frontend para `playinvest.com.br` nao funciona no app publico.

Por isso, a arquitetura correta aqui e:

- scraper no repositório
- JSON versionado em `data/`
- frontend lendo apenas arquivos locais

## Estrutura principal

- [`index.html`](index.html): pagina principal
- [`app.js`](app.js): interface e calculo do preco teto
- [`styles.css`](styles.css): visual do app
- [`service-worker.js`](service-worker.js): cache do PWA
- [`manifest.webmanifest`](manifest.webmanifest): manifesto instalavel
- [`scripts/update_playinvest_data.py`](scripts/update_playinvest_data.py): scraper da PlayInvest
- [`playinvest_tickers.json`](playinvest_tickers.json): lista de tickers a atualizar
- [`data/manifest.json`](data/manifest.json): manifesto dos dados gerados

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

## GitHub Actions

O workflow [`update-playinvest-data.yml`](.github/workflows/update-playinvest-data.yml) faz a atualizacao automatica dos JSONs:

- execucao manual via `workflow_dispatch`
- execucao agendada em dias uteis

Quando houver alteracao em `data/`, ele faz commit e push automaticamente.

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

## Fonte dos dados

Os dados do app sao gerados a partir da PlayInvest:

- https://playinvest.com.br/dividendos/baza3

Cada JSON gerado guarda a URL de origem do ticker correspondente.
