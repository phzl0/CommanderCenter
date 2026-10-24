# Arquitetura do MVP

## Organização

- `backend/app/core`: configuração, banco e segurança.
- `backend/app/models.py`: entidades SQLAlchemy e restrições relacionais.
- `backend/app/modules/auth.py`: login, sessão e logout.
- `backend/app/modules/management.py`: projetos, tarefas, atividades e indicadores.
- `backend/app/modules/data_service.py`: leitura limitada e análise com Pandas.
- `backend/app/modules/files.py`: originais e configurações de análise.
- `backend/app/modules/reports.py`: geração, consulta e download de relatórios.
- `backend/alembic`: migração inicial versionada.
- `frontend/src`: interface React com navegação, formulários e tratamento de erros.

## Segurança e privacidade

Senhas são protegidas com Argon2. A sessão é um token aleatório opaco em cookie HttpOnly e SameSite=Strict, com duração de 12 horas; apenas seu hash é guardado no banco. Logout revoga a sessão. Cookies não usam Secure no HTTP local; antes de exposição pública será necessário configurar HTTPS e COOKIE_SECURE.

Mutações exigem Origin permitido, inclusive login e logout. O frontend usa `/api` pelo proxy local. O backend não habilita CORS permissivo. A documentação da API é acessível localmente; chamadas de escrita feitas por ferramentas externas precisam do cabeçalho Origin configurado, além da sessão.

Toda consulta de negócio filtra `owner_id`. Chaves estrangeiras compostas também impedem relações entre dados de usuários diferentes. Não existe campo público para escolher o proprietário. A criação de contas ocorre no CLI, e não via API pública.

Originais e exportações recebem nomes UUID em volume privado, fora de diretórios públicos. Downloads exigem sessão e propriedade. CSV/Excel neutralizam textos que poderiam ser interpretados como fórmulas ao abrir a exportação.

O limitador de login permite 10 tentativas por endereço em 10 minutos, em memória de um único processo. É apropriado ao MVP local; um deploy com múltiplas instâncias exigirá limitação compartilhada. A leitura de arquivos é limitada, mas roda no mesmo serviço; processamento assíncrono e quotas de armazenamento são evoluções futuras.

## Relações

Usuário possui projetos, tarefas, atividades, importações, análises e relatórios. Tarefa tem projeto opcional. Atividade tem tarefa/projeto opcionais. Análise pertence a uma importação. Relatório pode referenciar uma análise ou representar os dados de gestão.

Os dados brutos de planilhas permanecem em arquivos privados. O PostgreSQL guarda metadados e configurações da análise; o Pandas recalcula a análise ao executar ou gerar relatório. Não há transformação automática da planilha em registros de gestão.

## Limites e decisões

As tabelas de projetos, tarefas e atividades têm paginação. Seletores de relacionamento exibem até 1.000 registros. Não há exclusão de projetos/tarefas no MVP: projetos podem ser arquivados e tarefas, concluídas/reabertas. Isso mantém os vínculos históricos.

Sem dados demonstrativos na aplicação. As telas vazias orientam o primeiro uso. Não existem chamadas de IA nem dependência de serviços de IA. O desenho permite módulos futuros sem separação prematura em microserviços.
