# Conta e planejamento (0.6)

## Menu e perfil privado

A foto/inicial no canto superior direito abre Ver meu perfil, Preferências, Conexões, Segurança e Sair. O menu aceita teclado, Escape e clique fora. Não há perfil público nem alteração de e-mail nesta etapa. Nome, descrição, atuação e interesses podem ser editados. No editor do radar, Usar interesses do perfil copia os interesses para o filtro de palavras-chave; isso exige uma escolha explícita e não reconfigura os outros radares.

Fotos aceitam JPEG, PNG ou WEBP de até 5 MB e 16 milhões de pixels. O backend converte a imagem para JPEG com até 256 × 256, descartando metadados. A imagem fica no banco e só é acessível na sessão do proprietário. O backup do PostgreSQL também inclui essas fotos.

## Preferências

A conta salva página inicial (Visão geral/Meu dia), fuso IANA, texto padrão/ampliado, movimento reduzido, avisos de operações, alertas de prazo, antecedência e capacidade diária de referência. O fuso é aplicado ao dia de planejamento, prazos, períodos do dashboard e agenda. A paleta permanece azul-marinho e verde-claro. Datas sem horário, como o prazo de uma tarefa, não mudam de dia ao trocar de fuso.

Avisos de erro e a possibilidade de desfazer exclusões compatíveis permanecem disponíveis. Desativar avisos de sucesso reduz os toasts e o registro dessas operações; não apaga o histórico existente. A preferência de movimento reduzido inicia o carrossel pausado, além de reduzir animações de interface.

## Segurança

Trocar a senha exige a senha atual e uma nova senha de 12 a 128 caracteres. Todas as sessões anteriores são invalidadas e este navegador recebe uma sessão nova. Também é possível listar as próprias sessões e encerrar somente as outras. Identificadores secretos de sessão não são retornados pela API.

O cookie é HttpOnly e SameSite=Lax para permitir o retorno de OAuth por navegação de primeiro nível. Operações de escrita continuam exigindo uma origem autorizada. O callback OAuth mantém state, PKCE e vínculo com a sessão. Contas adicionais continuam sendo criadas pela CLI; não há cadastro público ou painel administrativo nesta entrega.

## Conexões

A central reúne GitHub, Microsoft e Google Calendar, mostrando conta, permissões solicitadas, última consulta e erro conhecido. Consultas são feitas sob demanda. Desconectar remove a autorização local; revogar também no provedor continua sendo uma ação nas configurações desse provedor. O Google depende de configurar um aplicativo OAuth: consulte [conexões](connections.md).

## Tarefas e recorrências

O módulo Tarefas permite filtros por situação, contexto, prioridade, etiqueta e intervalo de prazo. Cada tarefa aceita até oito etiquetas de 30 caracteres, normalizadas para minúsculas, uma meta e repetição diária, semanal ou mensal.

A próxima ocorrência é criada **ao concluir a atual**, com prazo futuro. Períodos perdidos não geram uma pilha retroativa. Reabrir e concluir a mesma ocorrência novamente não duplica sua sucessora. A mensal mantém o dia da primeira ocorrência quando possível: 31/01 → 28/02 → 31/03, por exemplo. O título, contexto, projeto, meta, prioridade e etiquetas são copiados. Alterar uma ocorrência não reescreve as já criadas. Não existe um agendador criando tarefas enquanto o sistema estiver fechado.

## Metas

Até 100 metas por conta, com título, descrição, contexto, prazo e alvo. Há cálculo por tarefas concluídas vinculadas, por minutos de registros pessoais vinculados ou por valor manual. Vincule tarefas no formulário da tarefa e tempo em Registrar dados. Reabrir uma tarefa ou excluir logicamente um registro recalcula o progresso. Arquivar mantém os vínculos e dados; pode ser reativada. Não é possível mudar o tipo de cálculo enquanto houver registros vinculados.

## Agenda e capacidade

Compromissos locais têm início/fim, contexto e notas, com edição e exclusão confirmada. Horários sem offset são interpretados no fuso da conta; um horário inexistente por mudança de fuso sazonal é recusado. O Google Calendar é somente leitura. Tarefas com prazo aparecem junto, mas não viram blocos de horário automaticamente.

A capacidade mostra a referência configurada menos os intervalos ocupados, unindo sobreposições para não contar tempo duas vezes. Eventos de dia inteiro e eventos transparentes do Google não bloqueiam minutos. Não há estimativa de duração de tarefa, janelas de expediente ou otimização automática. Compromissos locais têm duração máxima de sete dias; a listagem diária limita a 300 locais e 250 eventos Google, sinalizando uma próxima página externa quando disponível. Calendários mostram até 100 opções; cinco mil compromissos locais por conta.

## Alertas

O sino consulta prazos ao entrar e a cada cinco minutos enquanto a página estiver visível. Alertas incluem até 30 tarefas pendentes com prazo próximo/atrasado e conexões sem consulta recente. Não há e-mail, push do navegador, WhatsApp ou serviço em segundo plano nesta versão. Cada tarefa gera no máximo um aviso de prazo por dia local. Completar a tarefa marca seu aviso como lido. Há Abrir tarefa/conexões e Dispensar na central. Falhas de integração também geram avisos com repetição limitada.

A autenticação externa foi testada com respostas simuladas. A validação ao vivo depende das contas e configurações do proprietário; não são criadas credenciais reais automaticamente. O uso local e as funções principais permanecem independentes de IA.
