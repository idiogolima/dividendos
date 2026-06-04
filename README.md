# dividendos

Script simples em Python para consultar o historico de dividendos de uma acao na B3 a partir do site `dadosdemercado.com.br`.

## O que o script faz

- recebe um ticker, a quantidade de anos e um percentual
- busca a pagina de dividendos da acao
- extrai a tabela de proventos
- calcula a soma por ano, o total no periodo, a media anual e um valor final derivado do percentual informado

## Requisitos

- Python 3.10 ou superior
- acesso a internet para consultar o site de origem

## Instalacao

Crie um ambiente virtual e instale as dependencias:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
python dividendos_historicos.py <ticker> <anos> <percentual>
```

Exemplo:

```bash
python dividendos_historicos.py PETR4 5 6
```

## Saida esperada

O script imprime:

- a serie historica de proventos por ano
- o total de proventos no periodo
- a media anual de proventos
- o valor final calculado a partir do percentual informado

## Observacoes

- o projeto depende da estrutura HTML do site de origem; se a pagina mudar, o scraping pode quebrar
- o locale `pt_BR.UTF-8` e opcional; se nao existir no sistema, o script continua executando
- a remocao dos arquivos no GitHub remoto exige `git push`; o commit local ja foi criado
