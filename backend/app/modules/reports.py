import io
from pathlib import Path
import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import date, datetime, time
from typing import Literal
from uuid import uuid4
from xml.sax.saxutils import escape
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from app.core.db import get_db
from app.core.security import current_user
from app.models import User, Project, Task, Activity, ImportFile, Analysis, Report
from app.modules.management import StrictModel, owned, dump
from app.modules.files import storage_path, read_import
from app.modules.data_service import AnalysisConfig, analyze

router = APIRouter(prefix="/api/reports", tags=["Relatórios"])


class ReportInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    format: Literal["csv", "xlsx", "pdf"] = "pdf"
    dataset: Literal["projects", "tasks", "activities", "analysis"] = "tasks"
    analysis_id: str | None = None
    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def dates(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("A data inicial deve ser anterior à data final.")
        if self.dataset == "analysis" and not self.analysis_id:
            raise ValueError("Selecione uma análise salva.")
        return self


def safe_value(v):
    if isinstance(v, str) and v.lstrip().startswith(
        ("=", "+", "-", "@", "\t", "\r", "\n")
    ):
        return "'" + v
    return v


def safe_frame(df):
    copy = df.copy()
    for c in copy.columns:
        copy[c] = copy[c].map(safe_value)
    copy.columns = [safe_value(str(c)) for c in copy.columns]
    return copy


def pdf_bytes(title, df, summary, groups):
    out = io.BytesIO()
    styles = getSampleStyleSheet()
    fonts = Path(reportlab.__file__).parent / "fonts"
    if "CCSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("CCSans", str(fonts / "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("CCSansBold", str(fonts / "VeraBd.ttf")))
    styles["Normal"].fontName = "CCSans"
    styles["Title"].fontName = "CCSansBold"
    styles["Title"].fontSize = 20
    body = ParagraphStyle(
        "cell", parent=styles["Normal"], fontSize=8, leading=11, wordWrap="CJK"
    )

    def para(value, style=body):
        text = " ".join(str(value).split()) if value is not None else ""
        text = text[:160] + "..." if len(text) > 160 else text
        return Paragraph(escape(text), style)

    story = [
        para(title, styles["Title"]),
        para(
            f"Command Center · {len(df)} registros · Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} UTC"
        ),
        Spacer(1, 12),
    ]
    for a in summary:
        label = {"sum": "Soma", "mean": "Média", "count": "Contagem"}[a["operation"]]
        story.append(para(f"{label} - {a['column']}: {a['value']}"))
    export_df = pd.DataFrame(groups) if groups else df
    # PDF is a readable summary; CSV/XLSX retain all rows and columns.
    shown = export_df.iloc[:200, :8]
    story.extend(
        [
            Spacer(1, 12),
            para(
                f"Prévia: {len(shown)} de {len(export_df)} linhas; {len(shown.columns)} de {len(export_df.columns)} colunas. Textos longos abreviados. Use CSV/Excel para os dados completos."
            ),
            Spacer(1, 8),
        ]
    )
    if len(shown.columns):
        data = [[para(c) for c in shown.columns]] + [
            [para("" if pd.isna(v) else v) for v in row]
            for row in shown.itertuples(index=False, name=None)
        ]
        table = Table(
            data,
            repeatRows=1,
            colWidths=[(landscape(A4)[0] - 64) / len(shown.columns)]
            * len(shown.columns),
            hAlign="LEFT",
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f8fafc")],
                    ),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(table)

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("CCSans", 8)
        canvas.setFillColor(colors.HexColor("#8793a3"))
        canvas.drawString(32, 18, "Command Center - Relatório privado")
        canvas.drawRightString(landscape(A4)[0] - 32, 18, f"Página {doc.page}")
        canvas.restoreState()

    SimpleDocTemplate(
        out,
        pagesize=landscape(A4),
        leftMargin=32,
        rightMargin=32,
        topMargin=32,
        bottomMargin=36,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()


def export_bytes(data, df, summary, groups):
    safe = safe_frame(df)
    if data.format == "csv":
        return safe.to_csv(index=False, sep=";", lineterminator="\n").encode(
            "utf-8-sig"
        )
    if data.format == "pdf":
        return pdf_bytes(data.title, df, summary, groups)
    out = io.BytesIO()
    with pd.ExcelWriter(out, engine="openpyxl") as writer:
        safe.to_excel(writer, index=False, sheet_name="Dados")
        if summary:
            safe_frame(pd.DataFrame(summary)).to_excel(
                writer, index=False, sheet_name="Resumo"
            )
        if groups:
            safe_frame(pd.DataFrame(groups)).to_excel(
                writer, index=False, sheet_name="Agrupamentos"
            )
    return out.getvalue()


@router.get("")
def list_reports(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return [
        dump(r)
        for r in db.scalars(
            select(Report)
            .where(Report.owner_id == user.id)
            .order_by(Report.created_at.desc())
            .limit(1000)
        )
    ]


@router.post("", status_code=201)
def create_report(
    data: ReportInput, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    summary = []
    groups = []
    analysis_id = None
    if data.dataset == "analysis":
        a = owned(db, Analysis, data.analysis_id, user)
        analysis_id = a.id
        row = owned(db, ImportFile, a.import_id, user)
        config = AnalysisConfig(**a.config)
        df, _ = read_import(row, config.sheet)
        df, summary, groups = analyze(df, config)
    else:
        model = {"projects": Project, "tasks": Task, "activities": Activity}[
            data.dataset
        ]
        field = model.occurred_at if model is Activity else model.created_at
        query = select(model).where(model.owner_id == user.id)
        if data.date_from:
            query = query.where(field >= datetime.combine(data.date_from, time.min))
        if data.date_to:
            query = query.where(field <= datetime.combine(data.date_to, time.max))
        rows = db.scalars(query.order_by(field.desc()).limit(50001)).all()
        if len(rows) > 50000:
            raise HTTPException(
                422, "Relatório limitado a 50.000 registros. Reduza o período."
            )
        columns = [c.name for c in model.__table__.columns if c.name != "owner_id"]
        df = pd.DataFrame(
            [{c: getattr(r, c) for c in columns} for r in rows], columns=columns
        )
    content = export_bytes(data, df, summary, groups)
    name = uuid4().hex + "." + data.format
    path = storage_path(name)
    report = Report(
        owner_id=user.id,
        title=data.title,
        format=data.format,
        analysis_id=analysis_id,
        stored_name=name,
        parameters=data.model_dump(mode="json"),
    )
    try:
        path.write_bytes(content)
        db.add(report)
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return dump(report)


@router.get("/{identity}/download")
def download_report(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    report = owned(db, Report, identity, user)
    path = storage_path(report.stored_name)
    if not path.exists():
        raise HTTPException(404, "Arquivo indisponível.")
    media = {
        "csv": "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pdf": "application/pdf",
    }
    return FileResponse(
        path,
        filename="relatorio-" + report.id + "." + report.format,
        media_type=media[report.format],
    )


@router.delete("/{identity}", status_code=204)
def delete_report(
    identity: str, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    report = owned(db, Report, identity, user)
    path = storage_path(report.stored_name)
    db.delete(report)
    db.commit()
    path.unlink(missing_ok=True)
