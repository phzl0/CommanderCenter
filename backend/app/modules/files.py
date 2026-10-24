import io
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Query
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.config import settings
from app.core.security import current_user
from app.models import User, ImportFile, Analysis, Report
from app.modules.management import owned, dump
from app.modules.data_service import load_frame, preview, analyze, AnalysisConfig, AnalysisInput

router=APIRouter(prefix='/api',tags=['Planilhas'])

def storage_path(name):
    root=settings.storage_dir.resolve()
    root.mkdir(parents=True,exist_ok=True)
    path=(root/name).resolve()
    if path.parent!=root: raise HTTPException(400,'Caminho inválido.')
    return path

def read_import(row, sheet=None):
    path=storage_path(row.stored_name)
    if not path.exists(): raise HTTPException(404,'Arquivo original indisponível. Confira o volume de armazenamento.')
    return load_frame(path,'.'+row.format,row.options,sheet)

@router.get('/imports')
def imports(db: Session=Depends(get_db),user: User=Depends(current_user)):
    return [dump(r) for r in db.scalars(select(ImportFile).where(ImportFile.owner_id==user.id).order_by(ImportFile.created_at.desc()).limit(1000))]

@router.post('/imports',status_code=201)
async def upload(file: UploadFile=File(...), encoding: str=Form('utf-8-sig'), separator: str=Form(''), decimal: str=Form('.'), sheet: str=Form(''), db: Session=Depends(get_db), user: User=Depends(current_user)):
    name=Path((file.filename or '').replace('\\','/')).name
    suffix=Path(name).suffix.lower()
    if suffix not in ('.csv','.xlsx','.xls'): raise HTTPException(422,'Envie CSV, XLSX ou XLS.')
    if len(name)>255 or not name: raise HTTPException(422,'Nome de arquivo inválido.')
    if encoding not in ('utf-8-sig','latin-1') or separator not in ('',',',';','\t','|') or decimal not in ('.',','):
        raise HTTPException(422,'Opções de leitura inválidas.')
    raw=bytearray()
    try:
        while chunk:=await file.read(1024*1024):
            raw.extend(chunk)
            if len(raw)>settings.max_upload_mb*1024*1024: raise HTTPException(413,f'Arquivo maior que {settings.max_upload_mb} MB.')
    finally: await file.close()
    options={'encoding':encoding,'separator':separator,'decimal':decimal,'sheet':sheet or None}
    df,sheets=await run_in_threadpool(load_frame,bytes(raw),suffix,options)
    stored=uuid4().hex+suffix
    path=storage_path(stored)
    row=ImportFile(owner_id=user.id,original_name=name,stored_name=stored,format=suffix[1:],size_bytes=len(raw),rows=len(df),columns=list(df.columns),sheets=sheets,options=options)
    try:
        path.write_bytes(raw);db.add(row);db.commit()
    except Exception:
        db.rollback();path.unlink(missing_ok=True);raise
    return {**dump(row),'preview':preview(df)}

@router.get('/imports/{identity}/preview')
def file_preview(identity: str,sheet: str|None=None,db: Session=Depends(get_db),user: User=Depends(current_user)):
    row=owned(db,ImportFile,identity,user);df,_=read_import(row,sheet)
    return preview(df)

@router.get('/imports/{identity}/download')
def original(identity: str,db: Session=Depends(get_db),user: User=Depends(current_user)):
    row=owned(db,ImportFile,identity,user);path=storage_path(row.stored_name)
    if not path.exists(): raise HTTPException(404,'Arquivo indisponível.')
    return FileResponse(path,filename=row.original_name,media_type='application/octet-stream')

@router.delete('/imports/{identity}',status_code=204)
def remove_import(identity: str,db: Session=Depends(get_db),user: User=Depends(current_user)):
    row=owned(db,ImportFile,identity,user)
    analyses=list(db.scalars(select(Analysis).where(Analysis.import_id==row.id,Analysis.owner_id==user.id)))
    ids=[a.id for a in analyses]
    reports=list(db.scalars(select(Report).where(Report.analysis_id.in_(ids),Report.owner_id==user.id))) if ids else []
    paths=[storage_path(row.stored_name)]+[storage_path(r.stored_name) for r in reports]
    for report in reports: db.delete(report)
    db.flush()
    for analysis in analyses: db.delete(analysis)
    db.flush();db.delete(row);db.commit()
    for path in paths: path.unlink(missing_ok=True)

@router.get('/analyses')
def analyses(db: Session=Depends(get_db),user: User=Depends(current_user)):
    return [dump(a) for a in db.scalars(select(Analysis).where(Analysis.owner_id==user.id).order_by(Analysis.created_at.desc()).limit(1000))]

@router.post('/imports/{identity}/analyze')
def run_preview(identity: str,config: AnalysisConfig,db: Session=Depends(get_db),user: User=Depends(current_user)):
    row=owned(db,ImportFile,identity,user);df,_=read_import(row,config.sheet)
    result,summary,groups=analyze(df,config)
    return {**preview(result),'summary':summary,'groups':groups[:100], 'total_groups':len(groups)}

@router.post('/analyses',status_code=201)
def save_analysis(data: AnalysisInput,db: Session=Depends(get_db),user: User=Depends(current_user)):
    row=owned(db,ImportFile,data.import_id,user);df,_=read_import(row,data.config.sheet);analyze(df,data.config)
    analysis=Analysis(owner_id=user.id,import_id=row.id,name=data.name,config=data.config.model_dump())
    db.add(analysis);db.commit();return dump(analysis)

@router.put('/analyses/{identity}')
def edit_analysis(identity: str,data: AnalysisInput,db: Session=Depends(get_db),user: User=Depends(current_user)):
    analysis=owned(db,Analysis,identity,user);row=owned(db,ImportFile,data.import_id,user)
    df,_=read_import(row,data.config.sheet);analyze(df,data.config)
    analysis.name=data.name;analysis.import_id=row.id;analysis.config=data.config.model_dump();db.commit();return dump(analysis)

@router.get('/analyses/{identity}/run')
def rerun(identity: str,db: Session=Depends(get_db),user: User=Depends(current_user)):
    a=owned(db,Analysis,identity,user);row=owned(db,ImportFile,a.import_id,user)
    config=AnalysisConfig(**a.config);df,_=read_import(row,config.sheet);result,summary,groups=analyze(df,config)
    return {**preview(result),'summary':summary,'groups':groups[:100],'total_groups':len(groups)}
