"""Resample dated points without inventing observations."""

from datetime import datetime, timedelta


def resample(data, interval, *, additive=False):
    if not data.get("chart") or interval == "day":
        return data
    if interval == "hour":
        return {
            **data,
            "period_note": "Fonte sem série por hora; exibindo a frequência original.",
        }
    chart = data["chart"]
    keys = [s["key"] for s in chart["series"]]
    groups = {}
    try:
        for point in chart["points"]:
            date = datetime.fromisoformat(point["label"])
            label = (
                date.strftime("%Y-%m")
                if interval == "month"
                else (date - timedelta(days=date.weekday())).strftime("%Y-%m-%d")
            )
            if label not in groups:
                groups[label] = {"label": label, **{k: None for k in keys}}
            for key in keys:
                value = point.get(key)
                if isinstance(value, (float, int)):
                    groups[label][key] = (
                        (groups[label][key] or 0) + value if additive else value
                    )
    except (ValueError, KeyError, TypeError):
        return {
            **data,
            "period_note": "Este gráfico não tem um eixo de datas para agrupar.",
        }
    return {
        **data,
        "chart": {**chart, "points": list(groups.values())},
        "period_note": "Totais por período."
        if additive
        else "Última observação disponível de cada período; sem interpolação.",
    }
