const path = require('node:path');
const express = require('express');
const cors = require('cors');

const { readConfig } = require('./config/env');
const healthRouter = require('./router/router-health');
const publicRouter = require('./router/router-public');
const authRouter = require('./router/router-auth');
const dashboardRouter = require('./router/router-dashboard');
const animalsRouter = require('./router/router-animals-v1');
const adoptionRequestsRouter = require('./router/router-adoption-requests');
const adoptersRouter = require('./router/router-adopters');
const donationsRouter = require('./router/router-donations');
const volunteersRouter = require('./router/router-volunteers');
const storiesRouter = require('./router/router-stories');
const usersRouter = require('./router/router-users');
const permissionsRouter = require('./router/router-permissions');
const webhooksRouter = require('./router/router-webhooks');
const securityHeaders = require('./middleware/security-headers');
const requestContext = require('./middleware/request-context');
const rateLimit = require('./middleware/rate-limit');
const errorHandler = require('./middleware/error-handler');
const AppError = require('./utils/app-error');

const config = readConfig();
const app = express();

app.disable('x-powered-by');
if (config.trustProxy !== undefined) app.set('trust proxy', config.trustProxy);

app.use(securityHeaders);
app.use(requestContext);
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Fotos enviadas pelo painel. Nomes são UUIDs (conteúdo nunca muda): cache longo. Podem ser exibidas
// pelo site em outra origem, por isso Cross-Origin-Resource-Policy cross-origin só aqui.
app.use('/uploads', express.static(path.resolve(config.uploadDir), {
  index: false,
  dotfiles: 'deny',
  immutable: true,
  maxAge: '365d',
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}));

app.use('/', healthRouter);
app.use('/api/v1', rateLimit({ windowMs: 5 * 60 * 1000, max: 1000 }));
app.use('/api/v1/public', publicRouter);
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

app.use((req, res, next) => {
  return next(new AppError(404, 'ROTA_NAO_ENCONTRADA', 'A rota solicitada não foi encontrada.'));
});

app.use(errorHandler);

module.exports = app;
