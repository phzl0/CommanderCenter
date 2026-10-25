# Estado atual do Command Center

## Implementado

MVP local com autenticação privada, isolamento por conta, tarefas, importação e análise de CSV/Excel e relatórios CSV/Excel/PDF. Há registros pessoais e financeiros manuais, cards configuráveis e repetidos, quatro slots por padrão, carrossel de notícias, fontes RSS personalizadas, favoritos, histórico de leitura, páginas de detalhes, notificações internas e restauração das exclusões compatíveis. O backend mantém projetos e atividades; suas abas foram retiradas do menu por decisão de produto.

Há consultas públicas de GitHub, indicadores BCB, clima Open-Meteo e ações Alpha Vantage. O código OAuth para GitHub e Microsoft está pronto, com tokens criptografados e permissões de leitura. O card Microsoft consulta Planner/To Do. As conexões OAuth exigem cadastro dos aplicativos e configuração local; testes simulados não substituem a validação com as contas reais. Veja [conexões](connections.md).

O tema usa fundo azul muito escuro, superfícies azul-marinho e uma paleta próxima de azul e verde-claro. As legendas e rótulos continuam identificando as séries sem depender só de cor.

A aba Meu dia inclui captura rápida, contexto pessoal/profissional, três prioridades, prazos locais, fechamento diário e revisão de sete dias. Consulte [Meu dia](meu-dia.md).

## Próximos passos práticos

1. Configurar e validar as conexões desejadas: GitHub/Microsoft e chave Alpha Vantage, quando usadas. A conexão GitHub atual lista repositórios públicos; privados ainda não estão incluídos.
2. Validar a rotina com dados reais: categorias de notícias, imagens fornecidas pelos feeds, planilhas pessoais, relatórios e permissões/licenças da organização Microsoft. Integrações podem ter atrasos, cotas e indisponibilidade.
3. Executar e conferir backup/restauração local do banco e do volume de arquivos, preservando a chave de criptografia das conexões. O procedimento manual existe; backup automático ainda não foi implementado.
4. Somente na etapa de publicação: configurar hospedagem, HTTPS, segredos, domínio, monitoramento e operação em produção. O Compose atual continua voltado ao uso local.

## Conta e planejamento (0.6)

Implementados perfil privado, foto, preferências, central de conexões, troca de senha, controle de sessões, etiquetas/filtros e recorrência nas tarefas, metas, agenda local com Google Calendar de leitura e alertas internos. Consulte [o guia de conta e planejamento](perfil-e-planejamento.md). A conexão Google exige cadastrar o aplicativo e autorizar a conta real.

## Evoluções futuras

Estimativas de duração de tarefas e blocos de expediente; sincronização/alertas em segundo plano; agente LangGraph opcional; acesso GitHub a repositórios privados; painel administrativo para criar contas e papéis (hoje criação por CLI). Mensagens de Teams/WhatsApp e outros aplicativos seguem fora da etapa atual por decisão do usuário. Conexões bancárias e conciliação automática não fazem parte do módulo financeiro manual.

Estas evoluções não são requisitos pendentes para usar o MVP local. Nenhuma função principal depende de IA, e ainda não houve deploy.
