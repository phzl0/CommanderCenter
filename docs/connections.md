# Conexões de contas (0.4)

O Command Center executa localmente. As conexões abaixo pertencem ao aplicativo; elas são independentes dos conectores do ChatGPT. Não envie chaves pelo chat nem as coloque no Git.

## GitHub

Um link completo como `https://github.com/dono/repositorio` ou `https://github.com/dono/repositorio.git` pode ser colado na configuração do card. O backend valida o domínio e extrai o nome. Links de issues, arquivos e domínios alternativos são recusados. Também funciona `dono/repositorio`, sem conectar uma conta.

Para o botão **Conectar GitHub** funcionar:

1. No GitHub, abra Settings → Developer settings → OAuth Apps → New OAuth App.
2. Nome: Command Center Local. Homepage: `http://localhost:5173`.
3. Authorization callback URL: `http://localhost:5173/api/integrations/github/callback`.
4. Copie Client ID e gere um Client Secret. Acrescente ao `.env` local:

```dotenv
GITHUB_CLIENT_ID=seu_client_id
GITHUB_CLIENT_SECRET=seu_client_secret
```

5. Recrie os serviços com `sudo docker compose up --build -d`.
6. Acesse pelo endereço **http://localhost:5173**, configure um card GitHub, clique em Conectar GitHub e autorize. Ao retornar, abra a configuração do card, use **Listar repositórios** e selecione um deles.

Esta versão solicita apenas `read:user`. Lista repositórios públicos associados à conta, por páginas de 30, até 20 páginas. Não solicita `repo`, não altera repositórios e não consulta repositórios privados. O filtro de nomes opera na página carregada; use Anterior/Próxima para outras páginas. Cada card pode selecionar um repositório diferente. O gráfico continua limitado aos 100 commits mais recentes da branch padrão no período.

## Microsoft: tarefas usadas no Teams

Esta integração consulta o Microsoft Graph: tarefas do Planner atribuídas ao usuário e listas do Microsoft To Do. Não consulta conversas, mensagens, presença, chamadas ou toda a atividade do Teams. O card retrata a situação atual das tarefas; o filtro histórico de dias não transforma esse resultado em um histórico de produtividade.

Para ativar **Conectar Microsoft**:

1. No Microsoft Entra admin center, abra App registrations → New registration. Use uma conta corporativa ou escolar com acesso ao Planner.
2. Registre a plataforma **Web** com redirect URI `http://localhost:5173/api/integrations/microsoft/callback`.
3. Em API permissions, adicione permissões **delegadas** Microsoft Graph `User.Read` e `Tasks.Read`. A autorização também solicita `offline_access` para renovar a conexão.
4. Em Certificates & secrets, crie um segredo. Copie seu **valor**, não o identificador. Guarde a data de expiração para renovar o segredo no futuro.
5. No `.env` local, acrescente:

```dotenv
MICROSOFT_CLIENT_ID=application_client_id
MICROSOFT_CLIENT_SECRET=valor_do_segredo
MICROSOFT_TENANT=directory_tenant_id
```

6. Recrie os serviços. Acesse **http://localhost:5173**, adicione o card Tarefas do Teams e conecte sua conta.
7. Escolha Planner (atribuídas a mim) ou Microsoft To Do. Para To Do, use **Listar listas do To Do**, escolha a lista e depois salve o card.

O padrão de tenant é `organizations`. Para um aplicativo registrado somente em sua organização, use o Directory (tenant) ID dela. Políticas da organização podem exigir aprovação administrativa. Licenças, tipo de plano e permissões condicionam os resultados; nem toda função do novo Planner ou plano premium é exposta por esses endpoints. Uma consulta lê até 100 tarefas; listas do To Do mostram até 100 opções. Resultados adicionais são sinalizados e devem ser consultados no aplicativo original. Não há criação, edição ou conclusão de tarefas externas.

## Segurança e persistência

A autorização usa state aleatório, PKCE S256, validade de dez minutos, consumo único e vínculo com usuário e sessão local. Não é um novo método de login do Command Center. Tokens ficam criptografados no PostgreSQL e nunca são retornados ao navegador. As requisições com tokens usam hosts fixos, sem seguir redirecionamentos; a integração não envia credenciais a URLs fornecidas pelo usuário.

A chave de criptografia é criada automaticamente com permissão restrita dentro de `private_storage`, no arquivo `.integration-key`. **Faça backup do volume inteiro junto com o banco.** Não apague essa chave: sem ela será necessário reconectar as contas. O `.env` contém os segredos dos aplicativos e também deve ser preservado fora do Git.

Desconectar remove a autorização armazenada localmente e invalida o cache dos cards daquele serviço; os cards são mantidos. Para revogar a autorização também no provedor, remova o aplicativo nas configurações do GitHub ou da Microsoft. Trocar a conta Microsoft/GitHub exige desconectar e conectar a conta desejada. Se a autorização for revogada ou o segredo expirar, a interface orienta a reconexão.

Nenhuma credencial real foi criada automaticamente nesta etapa. Os fluxos de autenticação e consulta têm testes simulados, mas a validação ao vivo depende de registrar os aplicativos e autorizar as contas reais.

Referências oficiais: [OAuth GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Planner atribuído ao usuário](https://learn.microsoft.com/en-us/graph/api/planneruser-list-tasks?view=graph-rest-1.0), [tarefas do To Do](https://learn.microsoft.com/en-us/graph/api/todotasklist-list-tasks?view=graph-rest-1.0).

## Erro “redirect_uri is not associated with this application”

O GitHub recusou a URL de retorno enviada pelo aplicativo. Não é uma falha da senha do Command Center. No OAuth App que corresponde ao `GITHUB_CLIENT_ID` configurado, confira **Authorization callback URL**:

```text
http://localhost:5173/api/integrations/github/callback
```

Homepage URL é `http://localhost:5173`; o campo callback recebe a URL completa acima. Não use o link do repositório como callback. Confira que Client ID e Client Secret pertencem ao mesmo OAuth App. Se cadastrou uma GitHub App em vez de uma OAuth App, crie uma OAuth App para seguir esta integração.

A configuração do card agora mostra a URL efetivamente utilizada pelo backend. Copie-a para o cadastro do provedor. Não altere o destino para um domínio desconhecido e não remova a validação da URL para contornar o erro.

O Compose aceita `INTEGRATION_ORIGIN` no `.env` (padrão `http://localhost:5173`). Se escolher `http://127.0.0.1:5173`, cadastre o callback com esse mesmo host e use esse endereço no navegador. São sessões de navegador distintas: o backend pede que a conexão seja iniciada na origem configurada. A origem precisa estar na lista `ALLOWED_ORIGINS` do servidor. Não acrescente caminho ou `/#/` ao `INTEGRATION_ORIGIN`.

Depois de mudar o `.env`, recrie o backend para carregar as variáveis:

```bash
sudo docker compose up --build -d backend
```

Se alterou apenas o callback no GitHub, volte ao Command Center e inicie **Conectar GitHub** novamente. Não reutilize a página de autorização antiga. O aplicativo não consegue verificar nem editar a configuração de uma OAuth App no GitHub em seu nome.
