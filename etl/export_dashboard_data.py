"""Gera o data/dashboard.json consumido pelo painel de Acordos Internacionais
a partir do banco produzido pelo ETL do Google Drive
("BANCO DE DADOS GOOGLE DRIVE/output/internacionalizacao.db", tabela
acordos_fato_acordos).

Uso:
    python3 etl/export_dashboard_data.py
"""
from __future__ import annotations

import json
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


def resolve_country_coords(pais: str, geocoder: Geocoder) -> tuple[float | None, float | None]:
    lat, lon = geocoder.geocode(pais, None, None)
    if lat is not None:
        return lat, lon
    return COUNTRY_CENTER_FALLBACK.get(pais, (None, None))


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
                  Faixa_Vencimento, Data_Assinatura
           FROM acordos_fato_acordos"""
    ).fetchall()
    conn.close()

    geocoder = Geocoder()

    acordos = []
    by_pais: dict[str, dict] = {}
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
        })

        pais_entry = by_pais.setdefault(r["Pais"], {"pais": r["Pais"], "continente": r["Continente"], "n_acordos": 0, "n_ativos": 0})
        pais_entry["n_acordos"] += 1
        pais_entry["n_ativos"] += 1 if is_ativo else 0

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

    # ---- geocoding por país (mapa de fluxo) ----
    paises_geo = []
    for p in por_pais:
        lat, lon = resolve_country_coords(p["pais"], geocoder)
        paises_geo.append({**p, "lat": lat, "lon": lon})

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
    print(f"pasta de saída: {DATA_DIR}")


if __name__ == "__main__":
    main()
