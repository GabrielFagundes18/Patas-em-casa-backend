/*
 * ============================================================================
 * ARQUIVO: app.js
 * ============================================================================
 *
 * PARA QUE SERVE:
 *   Monta a APLICAÇÃO EXPRESS: o "coração" da API. Aqui é definido, em ordem:
 *     1. os middlewares globais (segurança, contexto da requisição, CORS, JSON);
 *     2. a pasta pública de fotos enviadas (/uploads);
 *     3. cada grupo de rotas (animais, adoções, doações, equipe...);
 *     4. a resposta 404 para rotas inexistentes;
 *     5. o tratador de erros (sempre por último).
 *   Este arquivo NÃO abre a porta: quem faz isso é o server.js. Separar assim
 *   permite que os testes usem o "app" sem subir um servidor de verdade.
 *
 * PRINCIPAIS ITENS:
 *   - config: configuração lida do .env.
 *   - app: a aplicação Express (exportada).
 *
 * CONEXÕES COM OUTROS ARQUIVOS:
 *   - express, cors (bibliotecas), node:path (módulo do Node).
 *   - ./config/env → readConfig().
 *   - ./modules/*\/...-routes → os roteadores de cada módulo.
 *   - ./middleware/* → security-headers, request-context, rate-limit, error-handler.
 *   - ./utils/app-error → classe de erro com status HTTP e código.
 *   - Quem usa: server.js e os testes (tests/unit/http-*.test.js, tests/integration).
 * ============================================================================
 */

// Módulo do Node para montar caminhos de pastas/arquivos de forma segura.
const path = require('node:path');
// Express: framework para criar servidores HTTP e definir rotas.
const express = require('express');
// cors: middleware que controla quais sites (origens) podem chamar a API pelo navegador.
const cors = require('cors');

// Leitura da configuração.
const { readConfig } = require('./config/env');
// Roteadores (cada um agrupa as rotas de um assunto).
// Rotas de "saúde" (verificar se a API e o banco estão no ar).
const healthRouter = require('./modules/health/health-routes');
// Rotas públicas (usadas pelo site, sem login).
const publicRouter = require('./modules/public/public-routes');
// Login, sessão, senha.
const authRouter = require('./modules/auth/auth-routes');
// Painel: indicadores e gráficos.
const dashboardRouter = require('./modules/dashboard/dashboard-routes');
// Cadastro de animais.
const animalsRouter = require('./modules/animals/animal-routes');
// Pedidos de adoção.
const adoptionRequestsRouter = require('./modules/adoptions/adoption-request-routes');
// Adotantes.
const adoptersRouter = require('./modules/adopters/adopter-routes');
// Doações.
const donationsRouter = require('./modules/donations/donation-routes');
// Voluntários.
const volunteersRouter = require('./modules/volunteers/volunteer-routes');
// Histórias de adoção.
const storiesRouter = require('./modules/stories/story-routes');
// Equipe (usuários do painel).
const usersRouter = require('./modules/users/user-routes');
// Matriz de permissões.
const permissionsRouter = require('./modules/permissions/permission-routes');
// Webhooks (avisos automáticos enviados pelo Mercado Pago).
const webhooksRouter = require('./modules/donations/webhook-routes');
// Middlewares (funções que rodam antes das rotas).
// Cabeçalhos HTTP de segurança.
const securityHeaders = require('./middleware/security-headers');
// Identificador da requisição e log de acesso.
const requestContext = require('./middleware/request-context');
// Limite de requisições por período (proteção contra abuso).
const rateLimit = require('./middleware/rate-limit');
// Tratamento centralizado de erros.
const errorHandler = require('./middleware/error-handler');
// Classe de erro da aplicação.
const AppError = require('./utils/app-error');

// Configuração da aplicação.
const config = readConfig();
// Cria a aplicação Express.
const app = express();

// Remove o cabeçalho "X-Powered-By: Express" (não revelar a tecnologia usada ajuda a segurança).
app.disable('x-powered-by');
// "trust proxy": quando a API fica atrás de um proxy (ex.: hospedagem), o Express passa a confiar
// nos cabeçalhos X-Forwarded-* para descobrir o IP real do visitante. Só é ativado se configurado.
if (config.trustProxy !== undefined) app.set('trust proxy', config.trustProxy);

// app.use(middleware): registra uma função que roda em TODAS as requisições, na ordem em que aparece.
// 1º: cabeçalhos de segurança.
app.use(securityHeaders);
// 2º: contexto (id da requisição, log ao terminar).
app.use(requestContext);
// 3º: CORS — só as origens configuradas podem chamar a API pelo navegador.
app.use(
  cors({
    // Lista de sites permitidos (ex.: http://localhost:3000).
    origin: config.corsOrigins,
    // credentials: true → permite enviar cookies (necessário para o cookie de sessão do painel).
    credentials: true,
  })
);
// 4º: converte o corpo das requisições em JSON para req.body (limite de 1 MB por requisição).
app.use(express.json({ limit: '1mb' }));

// Fotos enviadas pelo painel. Nomes são UUIDs (conteúdo nunca muda): cache longo. Podem ser exibidas
// pelo site em outra origem, por isso Cross-Origin-Resource-Policy cross-origin só aqui.
// express.static serve arquivos de uma pasta como se fossem páginas (GET /uploads/arquivo.jpg).
app.use('/uploads', express.static(path.resolve(config.uploadDir), {
  // Não mostra uma "página índice" da pasta.
  index: false,
  // Recusa arquivos que começam com ponto (ex.: .env), que costumam ser ocultos/sensíveis.
  dotfiles: 'deny',
  // "immutable" + maxAge: o navegador pode guardar a foto em cache por 1 ano sem perguntar de novo.
  immutable: true,
  maxAge: '365d',
  // Cabeçalho extra para permitir que o site (em outro endereço) exiba as fotos.
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));

// Rotas. O primeiro argumento é o "prefixo": as rotas do roteador ficam abaixo dele.
// Saúde: /health, /ready (na raiz).
app.use('/', healthRouter);
// Limite geral: no máximo 1000 requisições a cada 5 minutos por IP em /api/v1.
app.use('/api/v1', rateLimit({ windowMs: 5 * 60 * 1000, max: 1000 }));
app.use('/api/v1/public', publicRouter);
// Autenticação fica direto em /api/v1 (ex.: /api/v1/auth/login, /api/v1/me).
app.use('/api/v1', authRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/animals', animalsRouter);
app.use('/api/v1/adoption-requests', adoptionRequestsRouter);
app.use('/api/v1/adopters', adoptersRouter);
app.use('/api/v1/donations', donationsRouter);
app.use('/api/v1/volunteers', volunteersRouter);
app.use('/api/v1/stories', storiesRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/permissions', permissionsRouter);
app.use('/api/v1/webhooks', webhooksRouter);

// Se nenhuma rota acima respondeu, chega aqui: cria um erro 404.
// next(erro) pula direto para o middleware de erros (o errorHandler abaixo).
app.use((req, res, next) => {
  return next(new AppError(404, 'ROTA_NAO_ENCONTRADA', 'A rota solicitada não foi encontrada.'));
});

// Tratador de erros: precisa ser o ÚLTIMO middleware registrado.
app.use(errorHandler);

// Exporta o app para o server.js e para os testes.
module.exports = app;

/*
 * ============================================================================
 * RESUMO DO ARQUIVO
 * ============================================================================
 *
 * COMO O FLUXO FUNCIONA:
 *   Cada requisição passa pelos middlewares na ordem em que foram registrados:
 *   segurança → contexto → CORS → JSON → (fotos estáticas) → limite de
 *   requisições → roteador do módulo certo. Se nenhuma rota responder, vira 404;
 *   qualquer erro termina no errorHandler, que monta a resposta padronizada.
 *
 * CONCEITOS IMPORTANTES PARA ESTUDAR:
 *   - Express: app.use, roteadores (Router) e prefixos de rota.
 *   - Middlewares e a importância da ORDEM em que são registrados.
 *   - Middleware de erro (4 parâmetros) e next(erro).
 *   - CORS e cookies com credentials.
 *   - Arquivos estáticos e cabeçalhos de cache.
 *   - Separar "app" (lógica) de "server" (porta) para facilitar testes.
 * ============================================================================
 */
