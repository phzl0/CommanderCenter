import os
os.environ.setdefault('DATABASE_URL','sqlite:////tmp/cc-tests-default.db')
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from alembic import command
from alembic.config import Config
from app.core.config import settings
from app.core.db import get_db
from app.core.security import passwords, limiter
from app.main import app
from app.models import User

@pytest.fixture
def env(tmp_path):
    url=os.environ.get('TEST_DATABASE_URL',f'sqlite:///{tmp_path}/test.db')
    # A PostgreSQL integration target must be a disposable test database.
    if not url.startswith('sqlite:') and not url.split('?',1)[0].endswith('_test'):
        raise RuntimeError('TEST_DATABASE_URL must point to a database ending in _test')
    old_url=settings.database_url;old_storage=settings.storage_dir
    settings.database_url=url;settings.storage_dir=tmp_path/'storage'
    cfg=Config('alembic.ini')
    if not url.startswith('sqlite:'): command.downgrade(cfg,'base')
    command.upgrade(cfg,'head')
    engine=create_engine(url,connect_args={'check_same_thread':False} if url.startswith('sqlite:') else {})
    if url.startswith('sqlite:'):
        @event.listens_for(engine,'connect')
        def fk(connection,_):connection.execute('PRAGMA foreign_keys=ON')
    factory=sessionmaker(engine,expire_on_commit=False)
    with factory() as db:
        db.add_all([User(id='user-a',name='Paulo',email='a@example.com',password_hash=passwords.hash('strong-password-a')),User(id='user-b',name='Outro usuário',email='b@example.com',password_hash=passwords.hash('strong-password-b'))]);db.commit()
    def override():
        with factory() as db:
            try:yield db
            except Exception:db.rollback();raise
    app.dependency_overrides[get_db]=override
    limiter.attempts.clear()
    with TestClient(app,headers={'origin':'http://localhost:5173'}) as client:
        yield client,factory
    app.dependency_overrides.clear();engine.dispose()
    if not url.startswith('sqlite:'):command.downgrade(cfg,'base')
    settings.database_url=old_url;settings.storage_dir=old_storage

@pytest.fixture
def client(env):
    c,_=env
    assert c.post('/api/auth/login',json={'email':'a@example.com','password':'strong-password-a'}).status_code==200
    return c

def login_b(client):
    assert client.post('/api/auth/login',json={'email':'b@example.com','password':'strong-password-b'}).status_code==200
