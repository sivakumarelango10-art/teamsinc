import express from 'express';

const router = express.Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TeamSync Core API',
    version: '1.0.0',
    description: 'Production-ready API for TeamSync workspace management, tickets, users, and meetings.'
  },
  servers: [
    { url: '/api/v1', description: 'TeamSync API v1 Base' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Server API key configured in TEAMSYNC_API_KEY'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token format of the server API key'
      }
    },
    schemas: {
      TicketSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ticketNumber: { type: 'string', example: 'TS-1024' },
          type: { type: 'string', example: 'BUG' },
          status: { type: 'string', example: 'OPEN' },
          priority: { type: 'string', example: 'HIGH' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] }
  ],
  paths: {
    '/tickets': {
      get: {
        summary: 'Filter and list tickets with pagination',
        parameters: [
          { in: 'query', name: 'type', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
          { in: 'query', name: 'priority', schema: { type: 'string' } },
          { in: 'query', name: 'search', schema: { type: 'string' } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          '200': { description: 'Filtered ticket list with pagination' }
        }
      }
    },
    '/meetings': {
      get: {
        summary: 'Retrieve all meetings and live statistics',
        responses: {
          '200': { description: 'Meeting hub data and active sessions' }
        }
      }
    }
  }
};

router.get('/v1/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

router.get('/docs', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TeamSync API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #0f172a; color: #fff; font-family: system-ui, sans-serif; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui { filter: invert(88%) hue-rotate(180deg); }
    .swagger-ui .scheme-container { background: transparent; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
