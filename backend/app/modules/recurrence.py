import calendar
from datetime import timedelta, datetime
from sqlalchemy import select
from app.models import Task
from app.core.preferences import user_zone


def next_due(due, rule, today, anchor=None):
    if rule in ("daily", "weekly"):
        step = 1 if rule == "daily" else 7
        amount = max(1, (today - due).days // step + 1)
        return due + timedelta(days=step * amount)
    anchor = anchor or due.day
    year, month = due.year, due.month
    while True:
        month += 1
        if month > 12:
            month = 1
            year += 1
        result = due.replace(
            year=year, month=month, day=min(anchor, calendar.monthrange(year, month)[1])
        )
        if result > today:
            return result


def generate_next(db, user, row):
    if row.recurrence == "none" or not row.due_date:
        return
    if db.scalar(
        select(Task.id).where(
            Task.owner_id == user.id, Task.recurrence_parent_id == row.id
        )
    ):
        return
    anchor = row.due_date.day
    root = row
    # A monthly chain is bounded by the number of occurrences, not untrusted input.
    if row.recurrence == "monthly":
        visited = set()
        while root.recurrence_parent_id and root.id not in visited:
            visited.add(root.id)
            parent = db.scalar(
                select(Task).where(
                    Task.owner_id == user.id, Task.id == root.recurrence_parent_id
                )
            )
            if not parent:
                break
            root = parent
        if root.due_date:
            anchor = root.due_date.day
    due = next_due(
        row.due_date, row.recurrence, datetime.now(user_zone(db, user)).date(), anchor
    )
    db.add(
        Task(
            owner_id=user.id,
            title=row.title,
            description=row.description,
            context=row.context,
            priority=row.priority,
            project_id=row.project_id,
            goal_id=row.goal_id,
            tags=list(row.tags or []),
            recurrence=row.recurrence,
            recurrence_parent_id=row.id,
            due_date=due,
        )
    )
