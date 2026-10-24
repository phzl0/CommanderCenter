"""Bounded spreadsheet reading and deterministic analysis without external services."""
import csv
import io
import json
import math
import zipfile
from pathlib import Path
from typing import Literal
import pandas as pd
from fastapi import HTTPException
from pydantic import Field
from app.core.config import settings
from app.modules.management import StrictModel

class Filter(StrictModel):
    column: str
    operator: Literal['eq','ne','contains','gt','gte','lt','lte','is_empty','not_empty'] = 'eq'
    value: str = Field(default='',max_length=1000)

class Aggregate(StrictModel):
    column: str
    operation: Literal['sum','mean','count'] = 'count'

class AnalysisConfig(StrictModel):
    sheet: str | None = None
    columns: list[str] = Field(default_factory=list,max_length=100)
    filters: list[Filter] = Field(default_factory=list,max_length=20)
    aggregations: list[Aggregate] = Field(default_factory=list,max_length=20)
    group_by: list[str] = Field(default_factory=list,max_length=3)

class AnalysisInput(StrictModel):
    import_id: str
    name: str = Field(min_length=1,max_length=160)
    config: AnalysisConfig

def load_frame(source, suffix, options=None, sheet=None):
    options=options or {}
    try:
        sheets=[]
        if suffix=='.csv':
            raw=source if isinstance(source,bytes) else Path(source).read_bytes()
            encoding=options.get('encoding','utf-8-sig')
            decoded=raw.decode(encoding)
            separator=options.get('separator')
            if not separator:
                try: separator=csv.Sniffer().sniff(decoded[:8192],delimiters=',;\t|').delimiter
                except csv.Error: separator=','
            header=next(csv.reader(io.StringIO(decoded),delimiter=separator),[])
            if len(header)>settings.max_columns: raise HTTPException(422,'O arquivo excede o limite de colunas.')
            df=pd.read_csv(io.StringIO(decoded),sep=separator,decimal=options.get('decimal','.'),nrows=settings.max_rows+1)
        else:
            raw=source if isinstance(source,bytes) else Path(source).read_bytes()
            if suffix=='.xlsx':
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    if sum(i.file_size for i in z.infolist())>100*1024*1024 or len(z.infolist())>2000:
                        raise HTTPException(422,'Excel descompactado excede o limite de segurança (100 MB).')
            with pd.ExcelFile(io.BytesIO(raw),engine='openpyxl' if suffix=='.xlsx' else 'xlrd') as workbook:
                sheets=workbook.sheet_names
                chosen=sheet or options.get('sheet') or sheets[0]
                if chosen not in sheets: raise HTTPException(422,'Aba não encontrada no Excel.')
                if suffix=='.xlsx':
                    width=workbook.book[chosen].max_column
                else:
                    width=workbook.book.sheet_by_name(chosen).ncols
                if width and width>settings.max_columns: raise HTTPException(422,'A aba excede o limite de colunas.')
                df=pd.read_excel(workbook,sheet_name=chosen,nrows=settings.max_rows+1)
        if len(df)>settings.max_rows or len(df.columns)>settings.max_columns:
            raise HTTPException(422,f'Limite: {settings.max_rows} linhas e {settings.max_columns} colunas por aba.')
        if len(df.columns)==0: raise HTTPException(422,'O arquivo precisa ter cabeçalhos.')
        df.columns=[str(c) for c in df.columns]
        if not df.columns.is_unique: raise HTTPException(422,'Os nomes das colunas devem ser únicos.')
        return df,sheets
    except HTTPException: raise
    except UnicodeDecodeError:
        raise HTTPException(422,'Codificação inválida. Tente UTF-8 ou Latin-1 nas opções de importação.')
    except Exception:
        raise HTTPException(422,'Não foi possível ler a planilha. Confira formato, cabeçalhos e opções de leitura.')

def records(df):
    # Pandas converts dates, NaN and numpy scalars to JSON-compatible representations.
    return json.loads(df.to_json(orient='records',date_format='iso',force_ascii=False))

def preview(df):
    return {'columns':[{'name':c,'type':str(df[c].dtype),'numeric':bool(pd.api.types.is_numeric_dtype(df[c]) and not pd.api.types.is_bool_dtype(df[c]))} for c in df.columns], 'rows':records(df.head(50)), 'total_rows':len(df)}

def numeric(series):
    if not pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        raise HTTPException(422,'Soma, média e comparação numérica exigem uma coluna numérica. Confira o separador decimal da importação.')

def analyze(df,config: AnalysisConfig):
    requested=config.columns or list(df.columns)
    referenced=requested+config.group_by+[f.column for f in config.filters]+[a.column for a in config.aggregations]
    if any(c not in df.columns for c in referenced):
        raise HTTPException(422,'Uma coluna selecionada não existe nesta aba.')
    if len(set(requested))!=len(requested) or len(set(config.group_by))!=len(config.group_by):
        raise HTTPException(422,'Não repita colunas na seleção ou no agrupamento.')
    filtered=df.copy()
    for f in config.filters:
        s=filtered[f.column]
        if f.operator in ('is_empty','not_empty'):
            mask=s.isna() | s.astype('string').eq('').fillna(False)
            if f.operator=='not_empty': mask=~mask
        elif f.operator=='contains': mask=s.astype('string').str.contains(f.value,case=False,regex=False,na=False)
        else:
            value=f.value
            if pd.api.types.is_numeric_dtype(s):
                try:
                    value=float(value)
                    if not math.isfinite(value): raise ValueError()
                except ValueError: raise HTTPException(422,'Informe um número válido para o filtro (decimal com ponto).')
            elif f.operator in ('gt','gte','lt','lte'): numeric(s)
            if f.operator=='eq': mask=s==value
            elif f.operator=='ne': mask=s!=value
            elif f.operator=='gt': mask=s>value
            elif f.operator=='gte': mask=s>=value
            elif f.operator=='lt': mask=s<value
            else: mask=s<=value
        filtered=filtered.loc[mask.fillna(False)]
    summary=[]
    for a in config.aggregations:
        if a.operation!='count': numeric(filtered[a.column])
        value=getattr(filtered[a.column],a.operation)()
        summary.append({'column':a.column,'operation':a.operation,'value':None if pd.isna(value) or not math.isfinite(float(value)) else float(value) if a.operation!='count' else int(value)})
    groups=[]
    if config.group_by and config.aggregations:
        grouped=filtered.groupby(config.group_by,dropna=False,sort=False)
        result=grouped.size().rename('Registros').to_frame()
        for i,a in enumerate(config.aggregations):
            result[f'{a.operation}({a.column}) [{i+1}]']=getattr(grouped[a.column],a.operation)()
        groups=records(result.reset_index())
    return filtered.loc[:,requested],summary,groups
