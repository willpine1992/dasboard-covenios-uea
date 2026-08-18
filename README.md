# Acordos Internacionais · UEA

Dashboard estático com os acordos bilaterais internacionais da **Universidade
do Estado do Amazonas (UEA)**: quantos, com quem, desde quando, e pra onde
apontam no mapa a partir de Manaus.

**🔗 Site publicado:** https://willpine1992.github.io/dasboard-covenios-uea/

## O que tem no dashboard

Página única (`docs/index.html`) com:

- **Cartões de indicadores** — total de países, total de acordos, vigentes,
  expirados, instituições parceiras
- **Acordos por país** — ranking em barras horizontais invertidas
- **Acordos por ano** — gráfico de combinação (colunas = acordos novos no
  ano, linha = total acumulado)
- **Globo de fluxo** — arcos de Manaus até cada país parceiro, coloridos por
  continente; arraste pra girar, scroll pra zoom

Site 100% estático (HTML/CSS/JS + um JSON de dados, sem backend), publicado
via GitHub Pages.

## Fonte dos dados

Os dados vêm do banco SQLite gerado pelo ETL do Google Drive em
`../BANCO DE DADOS GOOGLE DRIVE/output/internacionalizacao.db`
(tabela `acordos_fato_acordos`) — ver o README daquela pasta pra entender
como esse banco é montado/atualizado (roda sozinho 1x por dia via launchd).

## Estrutura do repositório

```
DASHBOARD 3/
├── docs/                    # o dashboard publicado (GitHub Pages)
│   ├── index.html
│   ├── css/style.css        # mesmo design system do DASHBOARD 2 (GERBRAS)
│   ├── js/
│   │   ├── common.js        # tema, tooltip, helpers de agregação
│   │   ├── charts.js        # barras invertidas + combo chart
│   │   ├── flowmap.js       # globo 3D de fluxo
│   │   └── main.js          # orquestração da página
│   └── lib/                 # D3 v7, topojson (vendorizados, sem CDN)
│
├── data/
│   └── dashboard.json       # fonte única de dados do site
│
└── etl/
    ├── geocode.py           # geocoding via Nominatim (cache local)
    └── export_dashboard_data.py  # lê o banco de acordos e gera data/dashboard.json
```

## Como atualizar os dados

```bash
cd "DASHBOARD 3"
python3 etl/export_dashboard_data.py
```

Isso lê o banco mais recente de `BANCO DE DADOS GOOGLE DRIVE/output/` (rode
o ETL de lá primeiro se quiser dados novos do Drive) e regrava
`data/dashboard.json`. Depois é só commitar e dar push.

## Como rodar localmente

```bash
cd "DASHBOARD 3"
python3 -m http.server 8000
```

Abra `http://localhost:8000/docs/index.html`.
