#!/usr/bin/env python3
"""
amira_chart.py — Generador de gráficas para AmiraPredictor v1.2.0
safeCareNeo · Dashboard de riesgos neonatales

Uso:
    python amira_chart.py --data data.json --out dashboard.png
    python amira_chart.py --data data.json --out dashboard.png --unidad UCIN-01

Formato esperado del JSON de entrada (data.json):
{
  "unidad_id": "UCIN-01",
  "history": [
    { "temperatura": 36.8, "humedad": 60.2, "presion": 1013.0, "timestamp": "2024-01-15T10:00:00" },
    ...
  ],
  "predictions": [
    {
      "timestamp": "2024-01-15T10:00:00",
      "risk_score": 15,
      "comfort_index": 88,
      "alert_level": "safe"
    },
    ...
  ]
}
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use('Agg')  # Sin pantalla (headless)
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.dates as mdates
import matplotlib.gridspec as gridspec
import numpy as np

# ─────────────────────────────────────────────────────────────────
# UMBRALES CLÍNICOS (deben coincidir con AmiraPredictor.js)
# ─────────────────────────────────────────────────────────────────
THRESHOLDS = {
    'temperatura': {
        'hypothermia_critical': 35.5,
        'hypothermia_warning':  36.0,
        'normal_min':           36.5,
        'normal_max':           37.5,
        'hyperthermia_warning': 37.8,
        'hyperthermia_critical':38.0,
    },
    'humedad': {
        'critical_low':  30,
        'warning_low':   40,
        'optimal_min':   50,
        'optimal_max':   70,
        'warning_high':  75,
        'critical_high': 80,
    },
    'presion': {
        'warning_low':  980,
        'normal_min':   990,
        'normal_max':   1030,
        'warning_high': 1040,
    },
}

ALERT_COLORS = {
    'safe':     '#22c55e',
    'watch':    '#f97316',
    'warning':  '#eab308',
    'critical': '#ef4444',
}

# ─────────────────────────────────────────────────────────────────
# DATOS DE DEMO
# ─────────────────────────────────────────────────────────────────
def generate_demo_data():
    """Genera datos de demo realistas para una sesión de ~2 horas."""
    import math, random
    random.seed(42)
    base_ts = datetime(2024, 1, 15, 8, 0, 0)
    history = []
    predictions = []

    temp   = 36.8
    hum    = 62.0
    press  = 1013.0

    alert_map = lambda rs: (
        'critical' if rs >= 70 else
        'warning'  if rs >= 45 else
        'watch'    if rs >= 20 else 'safe'
    )

    for i in range(120):  # 120 lecturas ~30s = 1 hora
        ts = base_ts.replace(second=0) if i == 0 else \
             datetime.fromtimestamp(base_ts.timestamp() + i * 30)

        # Simular eventos: enfriamiento en minuto 20-35, recuperación
        if 40 <= i <= 70:
            temp += random.gauss(-0.04, 0.02)
        elif 70 < i <= 90:
            temp += random.gauss(+0.06, 0.02)
        else:
            temp += random.gauss(0, 0.03)

        hum   += random.gauss(0, 0.3)
        press += random.gauss(0, 0.2)

        temp  = max(35.0, min(39.0, temp))
        hum   = max(30.0, min(90.0, hum))
        press = max(990.0, min(1040.0, press))

        history.append({
            'temperatura': round(temp, 2),
            'humedad':     round(hum, 2),
            'presion':     round(press, 2),
            'timestamp':   ts.isoformat()
        })

        # Predicciones cada 5 lecturas
        if i % 5 == 0:
            t  = THRESHOLDS['temperatura']
            tm = (t['normal_min'] + t['normal_max']) / 2
            tr = (t['normal_max'] - t['normal_min']) / 2
            ts_score = max(0, 100 - (abs(temp - tm) / tr) * 100)

            h  = THRESHOLDS['humedad']
            hm = (h['optimal_min'] + h['optimal_max']) / 2
            hr = (h['optimal_max'] - h['optimal_min']) / 2
            hs_score = max(0, 100 - (abs(hum - hm) / hr) * 100)

            comfort = round(ts_score * 0.55 + hs_score * 0.35 + 100 * 0.10)

            risk = max(0, min(100, int(
                (abs(temp - tm) / tr) * 60 +
                (abs(hum - hm) / hr) * 30
            )))

            predictions.append({
                'timestamp':     ts.isoformat(),
                'risk_score':    risk,
                'comfort_index': comfort,
                'alert_level':   alert_map(risk),
            })

    return {
        'unidad_id':   'UCIN-01-DEMO',
        'history':     history,
        'predictions': predictions,
    }


# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────
def parse_timestamps(records, field='timestamp'):
    return [datetime.fromisoformat(r[field]) for r in records]


def shade_zone(ax, ymin, ymax, color='#22c55e', alpha=0.08, label=None):
    ax.axhspan(ymin, ymax, color=color, alpha=alpha, zorder=0, label=label)


def threshold_line(ax, y, color, linestyle='--', lw=0.8, label=None):
    ax.axhline(y, color=color, linestyle=linestyle, linewidth=lw,
               alpha=0.7, label=label, zorder=1)


# ─────────────────────────────────────────────────────────────────
# GENERACIÓN DEL DASHBOARD
# ─────────────────────────────────────────────────────────────────
def build_dashboard(data: dict, out_path: str):
    unidad_id   = data.get('unidad_id', 'N/A')
    history     = data.get('history', [])
    predictions = data.get('predictions', [])

    if not history:
        print('⚠️  history está vacío — no hay nada que graficar.')
        sys.exit(1)

    T = THRESHOLDS

    # Parsear timestamps
    h_ts   = parse_timestamps(history)
    p_ts   = parse_timestamps(predictions) if predictions else []

    temps     = [r['temperatura'] for r in history]
    hums      = [r['humedad']     for r in history]
    pressures = [r['presion']     for r in history]

    risk_scores   = [p['risk_score']    for p in predictions]
    comfort_idxs  = [p['comfort_index'] for p in predictions]
    alert_levels  = [p['alert_level']   for p in predictions]
    point_colors  = [ALERT_COLORS[a]    for a in alert_levels]

    last_r = history[-1]
    last_p = predictions[-1] if predictions else None

    # ── Estilo oscuro ─────────────────────────────────────────────
    plt.style.use('dark_background')
    BG       = '#0f172a'
    CARD_BG  = '#1e293b'
    BORDER   = '#334155'
    TEXT_DIM = '#94a3b8'

    fig = plt.figure(figsize=(18, 14), facecolor=BG)
    fig.patch.set_facecolor(BG)

    outer = gridspec.GridSpec(
        3, 1, figure=fig,
        height_ratios=[0.9, 5, 5],
        hspace=0.45,
        left=0.06, right=0.97, top=0.96, bottom=0.06
    )

    # ── FILA 0: Header KPIs ───────────────────────────────────────
    kpi_ax = fig.add_subplot(outer[0])
    kpi_ax.set_facecolor(BG)
    kpi_ax.axis('off')

    alert_label = last_p['alert_level'].upper() if last_p else 'N/A'
    badge_color = ALERT_COLORS.get(last_p['alert_level'] if last_p else 'safe', '#6b7280')

    title_txt = f"AmiraPredictor v1.2.0  ·  Unidad: {unidad_id}"
    kpi_ax.text(0.0, 0.85, title_txt, transform=kpi_ax.transAxes,
                fontsize=16, fontweight='bold', color='#38bdf8', va='top')

    now_str = datetime.now().strftime('%d/%m/%Y %H:%M')
    kpi_ax.text(0.0, 0.35, f"safeCareNeo  ·  {len(history)} lecturas  ·  {now_str}",
                transform=kpi_ax.transAxes, fontsize=9, color=TEXT_DIM, va='top')

    # Badge de alerta
    kpi_ax.text(1.0, 0.85, f"  {alert_label}  ",
                transform=kpi_ax.transAxes, fontsize=11, fontweight='bold',
                color='white', va='top', ha='right',
                bbox=dict(boxstyle='round,pad=0.4', facecolor=badge_color, edgecolor='none'))

    # KPIs en línea
    kpis = [
        ('Temperatura', f"{last_r['temperatura']:.1f} °C",  '#f87171'),
        ('Humedad',     f"{last_r['humedad']:.1f} %",       '#60a5fa'),
        ('Presión',     f"{last_r['presion']:.0f} hPa",     '#a78bfa'),
        ('Risk Score',  f"{last_p['risk_score']}" if last_p else '—', '#fb923c'),
        ('Confort',     f"{last_p['comfort_index']}" if last_p else '—', '#34d399'),
    ]
    for idx, (lbl, val, col) in enumerate(kpis):
        x = 0.0 + idx * 0.20
        kpi_ax.text(x, -0.05, lbl, transform=kpi_ax.transAxes,
                    fontsize=8, color=TEXT_DIM, va='top')
        kpi_ax.text(x, -0.55, val, transform=kpi_ax.transAxes,
                    fontsize=14, fontweight='bold', color=col, va='top')

    # ── FILAS 1 y 2: Gráficas ────────────────────────────────────
    inner_top = gridspec.GridSpecFromSubplotSpec(
        1, 2, subplot_spec=outer[1], wspace=0.28)
    inner_bot = gridspec.GridSpecFromSubplotSpec(
        1, 2, subplot_spec=outer[2], wspace=0.28)

    axes = [
        fig.add_subplot(inner_top[0]),
        fig.add_subplot(inner_top[1]),
        fig.add_subplot(inner_bot[0]),
        fig.add_subplot(inner_bot[1]),
    ]

    def style_ax(ax, title):
        ax.set_facecolor(CARD_BG)
        for spine in ax.spines.values():
            spine.set_edgecolor(BORDER)
        ax.tick_params(colors=TEXT_DIM, labelsize=8)
        ax.xaxis.label.set_color(TEXT_DIM)
        ax.yaxis.label.set_color(TEXT_DIM)
        ax.set_title(title, color='#cbd5e1', fontsize=10, fontweight='semibold', pad=8)
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
        ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=4, maxticks=8))
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=0, ha='center')
        ax.grid(color=BORDER, linestyle='--', linewidth=0.5, alpha=0.5, zorder=0)

    # ── Gráfica 1: Temperatura ────────────────────────────────────
    ax = axes[0]
    style_ax(ax, 'Temperatura (°C)')

    # Zonas críticas
    shade_zone(ax, T['temperatura']['hypothermia_critical'],
               T['temperatura']['normal_min'], '#60a5fa', 0.07)
    shade_zone(ax, T['temperatura']['normal_min'],
               T['temperatura']['normal_max'], '#22c55e', 0.10)
    shade_zone(ax, T['temperatura']['normal_max'],
               T['temperatura']['hyperthermia_critical'], '#f97316', 0.07)

    # Líneas de umbral
    for y, c in [
        (T['temperatura']['hypothermia_critical'], '#ef4444'),
        (T['temperatura']['hypothermia_warning'],  '#f59e0b'),
        (T['temperatura']['normal_min'],            '#22c55e'),
        (T['temperatura']['normal_max'],            '#22c55e'),
        (T['temperatura']['hyperthermia_warning'],  '#f59e0b'),
        (T['temperatura']['hyperthermia_critical'], '#ef4444'),
    ]:
        threshold_line(ax, y, c)

    ax.plot(h_ts, temps, color='#f87171', linewidth=1.8,
            zorder=3, label='Temperatura')
    ax.set_ylabel('°C', fontsize=8)
    ax.set_ylim(min(temps) - 0.5, max(temps) + 0.5)

    legend_patches = [
        mpatches.Patch(color='#22c55e', alpha=0.5, label=f"Óptimo {T['temperatura']['normal_min']}–{T['temperatura']['normal_max']}°C"),
        mpatches.Patch(color='#ef4444', alpha=0.4, label='Zona crítica'),
    ]
    ax.legend(handles=legend_patches, fontsize=7, loc='upper right',
              facecolor=CARD_BG, edgecolor=BORDER, labelcolor=TEXT_DIM)

    # ── Gráfica 2: Humedad ────────────────────────────────────────
    ax = axes[1]
    style_ax(ax, 'Humedad (%)')

    shade_zone(ax, T['humedad']['critical_low'],
               T['humedad']['optimal_min'], '#60a5fa', 0.07)
    shade_zone(ax, T['humedad']['optimal_min'],
               T['humedad']['optimal_max'], '#22c55e', 0.10)
    shade_zone(ax, T['humedad']['optimal_max'],
               T['humedad']['critical_high'], '#f97316', 0.07)

    for y, c in [
        (T['humedad']['critical_low'],  '#ef4444'),
        (T['humedad']['warning_low'],   '#f59e0b'),
        (T['humedad']['optimal_min'],   '#22c55e'),
        (T['humedad']['optimal_max'],   '#22c55e'),
        (T['humedad']['warning_high'],  '#f59e0b'),
        (T['humedad']['critical_high'], '#ef4444'),
    ]:
        threshold_line(ax, y, c)

    ax.plot(h_ts, hums, color='#60a5fa', linewidth=1.8, zorder=3)
    ax.set_ylabel('%', fontsize=8)
    ax.set_ylim(max(0, min(hums) - 3), min(100, max(hums) + 3))

    legend_patches = [
        mpatches.Patch(color='#22c55e', alpha=0.5, label=f"Óptimo {T['humedad']['optimal_min']}–{T['humedad']['optimal_max']}%"),
        mpatches.Patch(color='#ef4444', alpha=0.4, label='Zona crítica'),
    ]
    ax.legend(handles=legend_patches, fontsize=7, loc='upper right',
              facecolor=CARD_BG, edgecolor=BORDER, labelcolor=TEXT_DIM)

    # ── Gráfica 3: Presión ────────────────────────────────────────
    ax = axes[2]
    style_ax(ax, 'Presion (hPa)')

    shade_zone(ax, T['presion']['normal_min'],
               T['presion']['normal_max'], '#a78bfa', 0.10)

    for y, c in [
        (T['presion']['warning_low'],  '#f59e0b'),
        (T['presion']['normal_min'],   '#a78bfa'),
        (T['presion']['normal_max'],   '#a78bfa'),
        (T['presion']['warning_high'], '#f59e0b'),
    ]:
        threshold_line(ax, y, c)

    ax.plot(h_ts, pressures, color='#a78bfa', linewidth=1.8, zorder=3)
    ax.set_ylabel('hPa', fontsize=8)
    margin = max(2, (max(pressures) - min(pressures)) * 0.3)
    ax.set_ylim(min(pressures) - margin, max(pressures) + margin)

    # ── Gráfica 4: Risk Score + Comfort Index ─────────────────────
    ax = axes[3]
    style_ax(ax, 'Risk Score  &  Indice de Confort')

    if predictions:
        # Zonas de alerta de fondo
        ax.axhspan(0,  20, color='#22c55e', alpha=0.05, zorder=0)
        ax.axhspan(20, 45, color='#f97316', alpha=0.05, zorder=0)
        ax.axhspan(45, 70, color='#eab308', alpha=0.05, zorder=0)
        ax.axhspan(70, 100, color='#ef4444', alpha=0.05, zorder=0)

        # Líneas de umbral de alerta
        for y, c, lbl in [
            (20, '#f97316', 'watch'),
            (45, '#eab308', 'warning'),
            (70, '#ef4444', 'critical'),
        ]:
            ax.axhline(y, color=c, linestyle='--', linewidth=0.8, alpha=0.6)
            ax.text(p_ts[-1], y + 1, lbl, fontsize=7, color=c, ha='right', alpha=0.8)

        # Comfort index (línea punteada verde)
        ax.plot(p_ts, comfort_idxs, color='#34d399', linewidth=1.5,
                linestyle='--', alpha=0.8, zorder=3, label='Confort')

        # Risk score con puntos coloreados por alerta
        ax.plot(p_ts, risk_scores, color='#fb923c', linewidth=1.8,
                zorder=3, label='Risk Score')
        ax.scatter(p_ts, risk_scores, c=point_colors, s=25,
                   zorder=4, edgecolors='none')

        ax.set_ylim(0, 105)
        ax.set_ylabel('Score (0–100)', fontsize=8)

        legend_patches = [
            mpatches.Patch(color='#fb923c', label='Risk Score'),
            mpatches.Patch(color='#34d399', label='Índice de Confort'),
        ] + [
            mpatches.Patch(color=v, alpha=0.7, label=k.capitalize())
            for k, v in ALERT_COLORS.items()
        ]
        ax.legend(handles=legend_patches, fontsize=7, loc='upper right',
                  facecolor=CARD_BG, edgecolor=BORDER, labelcolor=TEXT_DIM, ncol=2)
    else:
        ax.text(0.5, 0.5, 'Sin predicciones', transform=ax.transAxes,
                ha='center', va='center', color=TEXT_DIM, fontsize=10)

    # ── Footer ───────────────────────────────────────────────────
    fig.text(0.5, 0.005,
             f"AmiraPredictor v1.2.0 · safeCareNeo · modelo 1.1.0-clinical-rules · {datetime.now().isoformat()}",
             ha='center', fontsize=7.5, color='#475569')

    plt.savefig(out_path, dpi=150, bbox_inches='tight', facecolor=BG)
    plt.close(fig)
    print(f"✅  Dashboard guardado en: {out_path}")


# ─────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Genera dashboard de gráficas para AmiraPredictor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('--data',    default=None,            help='Ruta al archivo JSON con history + predictions')
    parser.add_argument('--out',     default='amira_dashboard.png', help='Ruta del PNG de salida (default: amira_dashboard.png)')
    parser.add_argument('--demo',    action='store_true',     help='Usar datos de demo (no requiere --data)')
    args = parser.parse_args()

    if args.demo:
        data = generate_demo_data()
        print(f"ℹ️  Usando datos de demo ({len(data['history'])} lecturas)")
    elif args.data:
        with open(args.data, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"ℹ️  Cargado: {args.data} ({len(data.get('history', []))} lecturas, {len(data.get('predictions', []))} predicciones)")
    else:
        parser.error('Especifica --data <archivo.json> o usa --demo')

    build_dashboard(data, args.out)


if __name__ == '__main__':
    main()
