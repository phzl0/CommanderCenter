"""Create local Docker configuration without overwriting existing credentials."""

from pathlib import Path
import secrets

path = Path(__file__).resolve().parent.parent / ".env"
try:
    with path.open("x") as file:
        file.write(
            "POSTGRES_DB=command_center\nPOSTGRES_USER=command_center\nPOSTGRES_PASSWORD="
            + secrets.token_urlsafe(32)
            + "\n"
        )
    path.chmod(0o600)
    print(".env local criado. A senha do banco não será exibida.")
except FileExistsError:
    print(".env já existe. Nenhuma configuração foi alterada.")
