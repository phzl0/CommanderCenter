# Command Center 0.7

## Navegação

- **Visão geral**: cinco cards visíveis no máximo; quatro em duas colunas e o quinto em largura inteira. No celular, uma coluna. Tipos repetidos continuam permitidos.
- **Notícias**: destaques com imagem, troca automática a cada dois segundos e manchetes abaixo. Categorias vêm das fontes. Sem listas de salvas/lidas. Movimento reduzido, foco, mouse e aba oculta suspendem a troca automática.
- **Agenda**: calendário mensal com seleção do dia; compromissos, afazeres e avisos. Afazeres podem ser concluídos/reabertos. Marcadores mensais incluem registros locais e tarefas anteriores; eventos Google aparecem no dia consultado quando a leitura está ativada.
- **Dados e arquivos**: originais, análises e relatórios na mesma área. Busca e páginas de oito arquivos.
- **Fontes e conexões**: abas internas para fontes e contas. Configuração de e-mail disponível na área de fontes.

Metas e Meu dia saíram da navegação. Registros anteriores não foram apagados. Tarefas anteriores com prazo aparecem na agenda e continuam acessíveis por link. Configurações antigas de notícias são preservadas. A migração oculta cards além do quinto; é possível reordenar, ocultar ou remover os anteriores na personalização.

## Lembretes locais

Escolha antecedência e canais no formulário do registro. O serviço `reminders` consulta a fila a cada 30 segundos, independentemente da página estar aberta. O sino consulta novidades a cada 30 segundos enquanto visível. Os serviços Docker e o computador precisam estar ligados. Não há push do navegador.

Para e-mail, configure no `.env` local:

```dotenv
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_USER=sua-conta
SMTP_PASSWORD=sua-senha-de-aplicativo
SMTP_FROM=seu-email@dominio.com
SMTP_SECURITY=starttls
```

Também é aceito `SMTP_SECURITY=ssl`, geralmente com porta 465. Use as configurações do seu provedor. As credenciais ficam no ambiente dos serviços e não são enviadas ao navegador. O destinatário é o e-mail cadastrado na própria conta; não há destinatário arbitrário no formulário.

Após preencher, recrie os serviços com `sudo docker compose up --build -d`. A indicação “configurado” verifica a presença da configuração; a entrega real depende do provedor. Falhas ficam no registro e são repetidas após cinco minutos, até o fim do compromisso. Registros concluídos ou já encerrados não geram lembrete. Uma mudança de horário/antecedência/canais reinicia o lembrete. Não há garantia de horário exato nem de recebimento: rede, spam e disponibilidade do provedor interferem. Uma interrupção imediatamente após a aceitação SMTP pode gerar duplicidade na nova tentativa.

## PDFs e planilhas

CSV/XLS/XLSX mantêm filtros, cálculos e exportação. PDFs de até 10 MB e 100 páginas são guardados e têm texto extraído por página e linha, com busca por filtros e relatórios PDF/CSV/XLSX a partir da análise salva. Não há interpretação automática de tabelas, valores financeiros ou resumo por IA. PDF digitalizado sem camada de texto é guardado, mas requer OCR para análise. PDF protegido por senha precisa de uma cópia desbloqueada. Extração usa processo separado com limites de tempo e memória.

## Clima

Busca por nome da cidade, com estado/país na seleção; entrada “Cidade, UF” pesquisa pelo nome antes da vírgula. A busca depende da cobertura geográfica do Open-Meteo. Há alternativa de localização do navegador, mediante permissão, que grava coordenadas no card. Condições atuais, sensação térmica, umidade, chuva, vento e próximas horas; previsão de sete dias nos detalhes. É previsão modelada, não medição de uma estação local garantida.

## Visual

Grafite e azul, seguindo a organização por superfícies e contraste do [shadcn/ui](https://ui.shadcn.com/docs/theming), sem instalar outra biblioteca de interface. Logo vetorial de chapéu de bobo da corte e favicon compartilhado.

Sem preparação de deploy nesta etapa.
