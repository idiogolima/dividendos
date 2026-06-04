# dividendos

Aplicativo web em HTML, CSS e JavaScript para analisar historico de dividendos de acoes brasileiras e instalar como PWA.

O projeto foi estruturado para publicacao direta no GitHub Pages, sem backend e sem etapa de build.

## Links

- Repositorio: https://github.com/idiogolima/dividendos
- GitHub Pages: https://idiogolima.github.io/dividendos/

Se a URL do GitHub Pages ainda nao abrir, ative a publicacao em `Settings > Pages` no repositorio e aguarde o deploy inicial.

## O que o app faz

- consulta cotacao atual e historico de dividendos via navegador
- calcula total no periodo, media anual e valor final com base no percentual informado
- mostra totais por ano e eventos recentes de dividendos
- funciona como PWA com `manifest.webmanifest` e `service-worker.js`
- salva o ultimo resultado no navegador para reabrir rapido

## Limitacao importante

Por ser um app estatico hospedado no GitHub Pages, ele nao usa backend para esconder chave de API.

Na pratica, ele funciona sem token para os tickers liberados publicamente pela brapi no modo de teste:

- `PETR4`
- `VALE3`
- `ITUB4`
- `MGLU3`

Para suportar qualquer ticker em producao, o caminho correto e colocar um backend ou uma funcao serverless entre o frontend e a API.

## Estrutura

- `index.html`: pagina principal
- `styles.css`: visual do app
- `app.js`: regras de interface, consulta e calculos
- `manifest.webmanifest`: configuracao do PWA
- `service-worker.js`: cache offline da shell do app
- `assets/icon.svg`: icone do aplicativo
- `assets/icon-maskable.svg`: icone maskable do aplicativo
- `dividendos_historicos.py`: script Python legado mantido como referencia

## Rodar localmente

Como o app usa service worker, rode por HTTP local em vez de abrir o arquivo direto.

Exemplo com Python:

```bash
python3 -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

## Publicar no GitHub Pages

1. Envie os commits para o GitHub com `git push origin main`.
2. No repositorio, abra `Settings > Pages`.
3. Em `Build and deployment`, escolha `Deploy from a branch`.
4. Selecione a branch `main` e a pasta `/ (root)`.
5. Salve a configuracao.

Neste repositorio, a URL esperada do site e:

```text
https://idiogolima.github.io/dividendos/
```

De forma geral, para repositorio de projeto, a URL costuma ser:

```text
https://<usuario>.github.io/<repositorio>/
```

## Sem dependencias de frontend

O app nao depende de framework, bundler ou pacote npm.

## Fonte de dados

O app consulta a API da brapi diretamente do navegador. A documentacao oficial e:

- `https://brapi.dev/docs`
- `https://brapi.dev/docs/acoes`
