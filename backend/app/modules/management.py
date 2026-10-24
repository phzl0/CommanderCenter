from datetime import date, datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.security import current_user
from app.models import User, Project, Task, Activity, now

router = APIRouter(prefix="/api", tags=["Gestão"])

def dump(obj):
    return {c.name:getattr(obj,c.name) for c in obj.__table__.columns if c.name != "owner_id"}

def owned(db, model, identity, user):
    row = db.scalar(select(model).where(model.id==identity, model.owner_id==user.id))
    if row is None:
        raise HTTPException(404, "Registro não encontrado.")
    return row

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class ProjectInput(StrictModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10000)
    status: Literal["active","paused","completed","archived"] = "active"
    due_date: date | None = None

class TaskInput(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10000)
    project_id: str | None = None
    priority: Literal["low","medium","high"] = "medium"
    status: Literal["pending","in_progress","completed"] = "pending"
    due_date: date | None = None

class ActivityInput(StrictModel):
    description: str = Field(min_length=1, max_length=10000)
    project_id: str | None = None
    task_id: str | None = None
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    @field_validator("occurred_at")
    @classmethod
    def utc(cls, value):
        if value.tzinfo is None:
            raise ValueError("Informe data com fuso horário.")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

def page(db, model, conditions, offset, limit, order):
    count = db.scalar(select(func.count()).select_from(model).where(*conditions))
    rows = db.scalars(select(model).where(*conditions).order_by(*order).offset(offset).limit(limit)).all()
    return {"items":[dump(r) for r in rows], "total":count, "offset":offset, "limit":limit}

@router.get("/projects")
def projects(q: str="", status: str="", offset: int=Query(0,ge=0), limit: int=Query(50,ge=1,le=1000), db: Session=Depends(get_db), user: User=Depends(current_user)):
    filters = [Project.owner_id==user.id]
    if q: filters.append(Project.name.icontains(q,autoescape=True))
    if status: filters.append(Project.status==status)
    return page(db,Project,filters,offset,limit,[Project.created_at.desc(),Project.id])

@router.post("/projects", status_code=201)
def create_project(data: ProjectInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    row=Project(owner_id=user.id,**data.model_dump()); db.add(row); db.commit()
    return dump(row)

@router.put("/projects/{identity}")
def update_project(identity: str, data: ProjectInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    row=owned(db,Project,identity,user)
    for key,value in data.model_dump().items(): setattr(row,key,value)
    db.commit(); return dump(row)

@router.get("/tasks")
def tasks(q: str="", status: str="", project_id: str="", overdue: bool=False, offset: int=Query(0,ge=0), limit: int=Query(50,ge=1,le=1000), db: Session=Depends(get_db), user: User=Depends(current_user)):
    filters=[Task.owner_id==user.id]
    if q: filters.append(Task.title.icontains(q,autoescape=True))
    if status: filters.append(Task.status==status)
    if project_id: filters.append(Task.project_id==project_id)
    if overdue: filters.extend([Task.due_date<datetime.now(ZoneInfo("America/Sao_Paulo")).date(),Task.status!="completed"])
    return page(db,Task,filters,offset,limit,[Task.created_at.desc(),Task.id])

def save_task(db,user,data,row=None):
    if data.project_id: owned(db,Project,data.project_id,user)
    # Serialize status transitions so simultaneous completion requests do not duplicate history.
    if row:
        row=db.scalar(select(Task).where(Task.id==row.id,Task.owner_id==user.id).with_for_update().execution_options(populate_existing=True))
    was_completed = row is not None and row.status=="completed"
    if row is None:
        row=Task(owner_id=user.id);db.add(row)
    for key,value in data.model_dump().items(): setattr(row,key,value)
    if data.status=="completed" and not was_completed:
        row.completed_at=now();db.flush()
        db.add(Activity(owner_id=user.id,task_id=row.id,project_id=row.project_id,description=f"Tarefa concluída: {row.title}",origin="automatic",occurred_at=row.completed_at))
    elif data.status!="completed": row.completed_at=None
    db.commit();return dump(row)

@router.post("/tasks", status_code=201)
def create_task(data: TaskInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    return save_task(db,user,data)

@router.put("/tasks/{identity}")
def update_task(identity: str, data: TaskInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    return save_task(db,user,data,owned(db,Task,identity,user))

@router.get("/activities")
def activities(q: str="", offset: int=Query(0,ge=0), limit: int=Query(50,ge=1,le=1000), db: Session=Depends(get_db), user: User=Depends(current_user)):
    filters=[Activity.owner_id==user.id]
    if q: filters.append(Activity.description.icontains(q,autoescape=True))
    return page(db,Activity,filters,offset,limit,[Activity.occurred_at.desc(),Activity.id])

def save_activity(db,user,data,row=None):
    if data.project_id: owned(db,Project,data.project_id,user)
    values=data.model_dump()
    if data.task_id:
        task=owned(db,Task,data.task_id,user)
        if data.project_id and data.project_id!=task.project_id:
            raise HTTPException(422,"A tarefa não pertence ao projeto selecionado.")
        values["project_id"]=task.project_id
    if row is None:
        row=Activity(owner_id=user.id,origin="manual");db.add(row)
    elif row.origin!="manual":
        raise HTTPException(409,"O histórico automático não pode ser editado.")
    for key,value in values.items(): setattr(row,key,value)
    db.commit();return dump(row)

@router.post("/activities", status_code=201)
def create_activity(data: ActivityInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    return save_activity(db,user,data)

@router.put("/activities/{identity}")
def update_activity(identity: str, data: ActivityInput, db: Session=Depends(get_db), user: User=Depends(current_user)):
    return save_activity(db,user,data,owned(db,Activity,identity,user))

@router.get("/dashboard")
def dashboard(db: Session=Depends(get_db), user: User=Depends(current_user)):
    today=datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    def count(model,*where):
        return db.scalar(select(func.count()).select_from(model).where(model.owner_id==user.id,*where))
    counts={"active_projects":count(Project,Project.status=="active"),"pending_tasks":count(Task,Task.status!="completed"),"overdue_tasks":count(Task,Task.status!="completed",Task.due_date<today),"completed_tasks":count(Task,Task.status=="completed")}
    return {"counts":counts,"recent_activities":[dump(a) for a in db.scalars(select(Activity).where(Activity.owner_id==user.id).order_by(Activity.occurred_at.desc()).limit(8))],"upcoming_tasks":[dump(t) for t in db.scalars(select(Task).where(Task.owner_id==user.id,Task.status!="completed").order_by(Task.due_date.asc().nullslast(),Task.created_at.desc()).limit(8))]}
