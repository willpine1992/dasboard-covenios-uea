"""Gera o data/dashboard.json consumido pelo painel de Acordos Internacionais
a partir do banco produzido pelo ETL do Google Drive
("BANCO DE DADOS GOOGLE DRIVE/output/internacionalizacao.db", tabela
acordos_fato_acordos).

Uso:
    python3 etl/export_dashboard_data.py
"""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geocode import Geocoder  # noqa: E402

SOURCE_DB = (
    Path(__file__).resolve().parent.parent.parent
    / "BANCO DE DADOS GOOGLE DRIVE" / "output" / "internacionalizacao.db"
)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

MANAUS = {"cidade": "Manaus", "uf": "AM", "pais": "Brasil", "lat": -3.1316333, "lon": -59.9825041}

# fallback de centro por país, só usado se o Nominatim não resolver o nome
# (mesmo princípio do DASHBOARD 2: nunca cravar tudo no mesmo lugar)
COUNTRY_CENTER_FALLBACK: dict[str, tuple[float, float]] = {
    "Brasil": (-14.2350, -51.9253),
}

# override manual pra instituições cujo geocoding automático (nome exato
# ou variantes) cai num lugar errado/pouco útil — ex.: "Fundação
# Universidade do Amazonas" sem o "FUA" geocodificava só como "Brasil" e
# caía no centro geográfico do país (região Nordeste); e mesmo achando a
# cidade certa (Manaus), o ponto ficaria empilhado bem em cima da origem
# de todos os arcos. Usa o centro do estado do Amazonas como meio-termo:
# geograficamente correto, sem coincidir com o marcador de Manaus.
INSTITUTION_COORDS_OVERRIDE: dict[str, tuple[float, float]] = {
    "Fundação Universidade do Amazonas – FUA": (-4.4799250, -63.5185396),
}


def resolve_country_coords(pais: str, geocoder: Geocoder) -> tuple[float | None, float | None]:
    lat, lon = geocoder.geocode(pais, None, None)
    if lat is not None:
        return lat, lon
    return COUNTRY_CENTER_FALLBACK.get(pais, (None, None))


def institution_name_variants(name: str) -> list[str]:
    """Nomes alternativos pra tentar geocodificar quando o nome completo
    não resolve: o texto entre parênteses costuma ser a sigla/nome curto
    ('(EIGSI)', '(INP)') e o que vem antes/depois de um travessão costuma
    ser instituição-mãe vs. subunidade ('X – Faculdade de Medicina',
    'Y – CALTECH') — não dá pra saber de antemão qual lado é o nome
    "de verdade" pro Nominatim, então tenta os dois."""
    variants: list[str] = []
    no_parens = re.sub(r"\s*\([^)]*\)", "", name).strip()
    if no_parens and no_parens != name:
        variants.append(no_parens)
    for part in re.split(r"\s+[–-]\s+", no_parens):
        part = part.strip()
        if part and part not in variants:
            variants.append(part)
    for m in re.finditer(r"\(([^)]+)\)", name):
        acronym = m.group(1).strip()
        if acronym and acronym not in variants:
            variants.append(acronym)
    return [v for v in variants if v != name]


def resolve_institution_coords(
    instituicao: str, pais: str, geocoder: Geocoder
) -> tuple[float | None, float | None, bool]:
    """Geocodifica a instituição pelo nome (cai na cidade do campus, não no
    país inteiro). Se o Nominatim não achar nada pra esse nome exato,
    tenta variantes simplificadas (sem sigla/subunidade, ou só a sigla)
    antes de cair pro centro do país — melhor um ponto aproximado do que
    nenhum ponto. Retorna (lat, lon, achou_cidade)."""
    if instituicao in INSTITUTION_COORDS_OVERRIDE:
        lat, lon = INSTITUTION_COORDS_OVERRIDE[instituicao]
        return lat, lon, True

    lat, lon = geocoder.geocode(instituicao, None, pais)
    if lat is not None:
        return lat, lon, True

    for variant in institution_name_variants(instituicao):
        lat, lon = geocoder.geocode(variant, None, pais)
        if lat is not None:
            return lat, lon, True

    lat, lon = resolve_country_coords(pais, geocoder)
    return lat, lon, False


def main() -> None:
    if not SOURCE_DB.exists():
        raise SystemExit(
            f"Banco fonte não encontrado: {SOURCE_DB}\n"
            "Rode o ETL do Drive primeiro: "
            "'BANCO DE DADOS GOOGLE DRIVE/run_etl.sh'"
        )

    conn = sqlite3.connect(SOURCE_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT ID_Acordo, Instituicao_Parceira, Pais, Continente, Tipo_Acordo,
                  Ano_Inicio, Ano_Fim, Status_Vigencia_Referencia,
                  Faixa_Vencimento, Data_Assinatura, Data_Inicio, Data_Fim,
                  Prazo_Indeterminado, Abrangencia, Status_Validacao_ARI
           FROM acordos_fato_acordos"""
    ).fetchall()
    conn.close()

    geocoder = Geocoder()

    acordos = []
    by_pais: dict[str, dict] = {}
    by_instituicao: dict[str, dict] = {}
    by_ano: dict[int, int] = defaultdict(int)
    instituicoes = set()
    ativos = 0

    for r in rows:
        status = (r["Status_Vigencia_Referencia"] or "").strip()
        is_ativo = status == "Vigente"
        ativos += 1 if is_ativo else 0
        instituicoes.add(r["Instituicao_Parceira"])

        acordos.append({
            "id": r["ID_Acordo"],
            "instituicao": r["Instituicao_Parceira"],
            "pais": r["Pais"],
            "continente": r["Continente"],
            "tipo": r["Tipo_Acordo"],
            "ano_inicio": r["Ano_Inicio"],
            "ano_fim": r["Ano_Fim"],
            "status": status,
            "ativo": is_ativo,
            "faixa_vencimento": r["Faixa_Vencimento"],
            "data_inicio": r["Data_Inicio"],
            "data_fim": r["Data_Fim"],
            "prazo_indeterminado": (r["Prazo_Indeterminado"] or "").strip() == "Sim",
            "abrangencia": r["Abrangencia"],
            "status_validacao_ari": r["Status_Validacao_ARI"],
        })

        pais_entry = by_pais.setdefault(r["Pais"], {"pais": r["Pais"], "continente": r["Continente"], "n_acordos": 0, "n_ativos": 0})
        pais_entry["n_acordos"] += 1
        pais_entry["n_ativos"] += 1 if is_ativo else 0

        inst_entry = by_instituicao.setdefault(
            r["Instituicao_Parceira"],
            {"instituicao": r["Instituicao_Parceira"], "pais": r["Pais"], "continente": r["Continente"], "n_acordos": 0, "n_ativos": 0},
        )
        inst_entry["n_acordos"] += 1
        inst_entry["n_ativos"] += 1 if is_ativo else 0

        if r["Ano_Inicio"]:
            by_ano[int(r["Ano_Inicio"])] += 1

    # ---- por país (ranking p/ barras) ----
    por_pais = sorted(by_pais.values(), key=lambda p: p["n_acordos"], reverse=True)

    # ---- por ano + acumulado (combo chart) ----
    anos = sorted(by_ano.keys())
    por_ano = []
    acumulado = 0
    for ano in anos:
        acumulado += by_ano[ano]
        por_ano.append({"ano": ano, "novos": by_ano[ano], "acumulado": acumulado})

    # ---- geocoding por país (fallback + outros usos do painel) ----
    paises_geo = []
    for p in por_pais:
        lat, lon = resolve_country_coords(p["pais"], geocoder)
        paises_geo.append({**p, "lat": lat, "lon": lon})

    # ---- geocoding por instituição (mapa de fluxo — ponto na cidade real
    # do campus, não no país inteiro; institutions_geo_cidade_exata marca
    # se o Nominatim resolveu o nome da instituição ou se caiu no fallback
    # de país por não achar) ----
    por_instituicao = sorted(by_instituicao.values(), key=lambda p: p["n_acordos"], reverse=True)
    instituicoes_geo = []
    n_cidade_exata = 0
    for inst in por_instituicao:
        lat, lon, achou_cidade = resolve_institution_coords(inst["instituicao"], inst["pais"], geocoder)
        n_cidade_exata += 1 if achou_cidade else 0
        instituicoes_geo.append({**inst, "lat": lat, "lon": lon, "cidade_exata": achou_cidade})

    stats = {
        "total_paises": len(by_pais),
        "total_acordos": len(acordos),
        "ativos": ativos,
        "expirados": len(acordos) - ativos,
        "instituicoes": len(instituicoes),
    }

    dashboard = {
        "stats": stats,
        "por_pais": por_pais,
        "por_ano": por_ano,
        "paises_geo": paises_geo,
        "instituicoes_geo": instituicoes_geo,
        "acordos": acordos,
        "manaus": MANAUS,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "dashboard.json").write_text(
        json.dumps(dashboard, ensure_ascii=False, indent=None), encoding="utf-8"
    )

    print(f"stats             -> {stats}")
    print(f"por_pais          -> {len(por_pais)} países")
    print(f"por_ano           -> {len(por_ano)} anos ({anos[0] if anos else '-'}–{anos[-1] if anos else '-'})")
    print(f"paises_geo        -> {len(paises_geo)} países geocodificados "
          f"({sum(1 for p in paises_geo if p['lat'] is not None)} com coordenada)")
    print(f"instituicoes_geo  -> {len(instituicoes_geo)} instituições geocodificadas "
          f"({n_cidade_exata} na cidade exata, "
          f"{sum(1 for i in instituicoes_geo if i['lat'] is not None) - n_cidade_exata} no fallback do país, "
          f"{sum(1 for i in instituicoes_geo if i['lat'] is None)} sem coordenada)")
    print(f"pasta de saída: {DATA_DIR}")


if __name__ == "__main__":
    main()
