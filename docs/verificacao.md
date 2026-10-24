# Verificação do MVP 1

## Executado neste ambiente

- Build React/TypeScript com `npm run build`: aprovado.
- 13 testes de API/integração com bancos SQLite temporários e chaves estrangeiras habilitadas: aprovados.
- Migração Alembic inicial aplicada nos bancos de teste; geração do SQL para PostgreSQL aprovada.
- PDF gerado por um teste real e renderizado com Poppler para revisão visual.

## Cobertura da suíte

Autenticação, sessão revogada no logout, conta desativada, limite de tentativas, bloqueio de origens não autorizadas, rejeição de campos de proprietário enviados pelo cliente, isolamento entre usuários em consultas/edições/downloads, paginação/busca, conclusão de tarefas sem evento duplicado, reabertura, relações de atividade, CSV com codificação/decimal, múltiplas abas Excel, filtros/agregações/agrupamentos, análise salva/reexecutada, arquivos inválidos/limites, exportações CSV/XLSX/PDF e exclusão de arquivos relacionados.

## Validação adicional

O workflow `.github/workflows/ci.yml` executa a suíte contra PostgreSQL 17 e recompila o frontend. O resultado é registrado na aba Actions de cada commit. A existência do workflow, por si só, não comprova sua execução; consulte a conclusão do run.

## Pendente no Ubuntu

O ambiente de implementação não tem Docker. A execução dos três containers, a persistência dos volumes após reinício e a restauração de backups precisam ser verificadas no Ubuntu com Docker.

O navegador de inspeção está em outro ambiente e não alcançou o servidor local. Por isso, navegação visual, responsividade e interações completas por cliques ainda precisam ser avaliadas com o usuário, apesar do build e dos testes de API aprovados.

## Roteiro de aceite local

1. Inicializar `.env`, subir Compose e criar uma conta.
2. Entrar, atualizar a página e confirmar que a sessão continua.
3. Criar um projeto, uma tarefa vinculada e uma atividade manual.
4. Concluir a tarefa duas vezes via edição: deve existir somente um evento automático dessa conclusão.
5. Conferir os contadores do dashboard.
6. Importar CSV e Excel, testar abas e comparar soma/média com a planilha.
7. Salvar análise, reabrir, gerar CSV, Excel e PDF e abrir os três arquivos.
8. Criar segunda conta pelo CLI e confirmar que ela inicia sem os dados da primeira.
9. Parar e subir os serviços, verificar registros e download do original.
10. Testar backup/restauração em instalação vazia antes de depender dele.

PDF é resumo com limite de linhas/colunas e texto de células limitado a 1.000 caracteres. CSV e Excel incluem os dados completos dentro dos limites do MVP. Não há validação de deploy nesta etapa.
