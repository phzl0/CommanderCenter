"""Local account administration. No public signup endpoint."""

import argparse
import getpass
from sqlalchemy import select, delete
from app.core.db import SessionLocal
from app.core.security import passwords
from app.models import User, SessionToken


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action", choices=["create-user", "reset-password", "disable-user"]
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--name")
    args = parser.parse_args()
    email = args.email.strip().lower()
    if "@" not in email or len(email) > 254:
        parser.error("E-mail inválido.")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if args.action == "create-user":
            if user:
                parser.error("Usuário já existe.")
            if not args.name or not 1 <= len(args.name.strip()) <= 100:
                parser.error("Informe --name com até 100 caracteres.")
        elif not user:
            parser.error("Usuário não encontrado.")
        if args.action == "disable-user":
            user.active = False
        else:
            password = getpass.getpass("Senha (12 a 128 caracteres): ")
            confirm = getpass.getpass("Confirme a senha: ")
            if password != confirm or not 12 <= len(password) <= 128:
                parser.error("Senhas diferentes ou tamanho inválido.")
            if args.action == "create-user":
                user = User(
                    name=args.name.strip(),
                    email=email,
                    password_hash=passwords.hash(password),
                )
                db.add(user)
            else:
                user.password_hash = passwords.hash(password)
        if user.id:
            db.execute(delete(SessionToken).where(SessionToken.user_id == user.id))
        db.commit()
        print("Operação concluída.")


if __name__ == "__main__":
    main()
