# Backup local

Guarde banco, arquivos privados e `.env` em local protegido. Faça o backup com alterações pausadas para manter os arquivos e referências consistentes.

1. Pare backend e frontend; o banco continua ligado:

```bash
docker compose stop backend frontend
```

2. Exporte o banco em formato SQL. A expansão das variáveis acontece dentro do serviço do banco:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > command-center-backup.sql
```

3. Exporte os arquivos privados usando um container temporário do backend que já tem o volume montado:

```bash
docker compose run --rm --no-deps -T backend tar -C /app/storage -czf - . > command-center-files.tar.gz
```

4. Copie também o `.env` para seu local de backup e reinicie:

```bash
docker compose start backend frontend
```

Não envie esses backups ao GitHub. `pg_dump` guarda dados pessoais e hashes de senha.

## Restauração

Use uma instalação nova e vazia, com o `.env` correspondente. Não restaure sobre dados pessoais existentes sem avaliar conflitos. Inicie somente o banco:

```bash
docker compose up -d db
```

Aguarde o banco saudável. Restaure o SQL e os arquivos:

```bash
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"' < command-center-backup.sql
docker compose run --rm --no-deps -T backend tar -C /app/storage -xzf - < command-center-files.tar.gz
docker compose up -d
```

Esses arquivos devem ser backups próprios e confiáveis. Confira login, registros e download de um original após restaurar.
