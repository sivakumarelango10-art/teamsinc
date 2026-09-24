import express from 'express';

const router = express.Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TeamSync KalviLearn Integration API',
    version: '1.0.0',
    description: 'Production-ready server-to-server integration API for KalviLearn to create, track, and synchronize bug reports, feature requests, and user feedback in TeamSync.'
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
        description: 'Server-to-server secret API key configured in TEAMSYNC_API_KEY'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token format of the server API key'
      }
    },
    schemas: {
      FeedbackRequest: {
        type: 'object',
        required: ['source', 'type', 'title', 'description', 'reporter'],
        properties: {
          source: { type: 'string', example: 'KALVILEARN' },
          type: { type: 'string', enum: ['BUG', 'FEATURE', 'FEEDBACK', 'ISSUE', 'IMPROVEMENT', 'OTHER'], example: 'BUG' },
          title: { type: 'string', example: 'Student View is not opening' },
          description: { type: 'string', example: 'Clicking Student View from the Mentor Portal does not open the student details page.' },
          portal: { type: 'string', example: 'MENTOR' },
          route: { type: 'string', example: '/mentor/students' },
          module: { type: 'string', example: 'STUDENT_VIEW' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], example: 'HIGH' },
          externalReferenceId: { type: 'string', example: 'kalvilearn-feedback-12345' },
          reporter: {
            type: 'object',
            required: ['name', 'email'],
            properties: {
              externalUserId: { type: 'string', example: 'usr_98172' },
              name: { type: 'string', example: 'Aaditya R M' },
              email: { type: 'string', format: 'email', example: 'aaditya.rm@kalvium.com' },
              role: { type: 'string', example: 'MENTOR' }
            }
          },
          environment: { type: 'string', example: 'production' },
          browser: { type: 'string', example: 'Chrome' },
          device: { type: 'string', example: 'Desktop' },
          appVersion: { type: 'string', example: '1.0.0' },
          metadata: {
            type: 'object',
            properties: {
              requestId: { type: 'string', example: 'req_81920' }
            }
          }
        }
      },
      TicketSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ticketNumber: { type: 'string', example: 'TS-1024' },
          source: { type: 'string', example: 'KALVILEARN' },
          externalReferenceId: { type: 'string', example: 'kalvilearn-feedback-12345' },
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
    '/integrations/kalvilearn/feedback': {
      post: {
        summary: 'Create a report/ticket or retrieve existing idempotent ticket',
        parameters: [
          {
            in: 'header',
            name: 'Idempotency-Key',
            schema: { type: 'string' },
            description: 'Unique request identifier to prevent duplicate submissions'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FeedbackRequest' }
            }
          }
        },
        responses: {
          '201': {
            description: 'Ticket created successfully',
            content: { 'application/json': { schema: { properties: { success: { type: 'boolean' }, ticket: { $ref: '#/components/schemas/TicketSummary' } } } } }
          },
          '200': {
            description: 'Idempotent duplicate request - existing ticket returned',
            content: { 'application/json': { schema: { properties: { success: { type: 'boolean' }, idempotent: { type: 'boolean' }, ticket: { $ref: '#/components/schemas/TicketSummary' } } } } }
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized API key' },
          '429': { description: 'Rate limit exceeded' }
        }
      }
    },
    '/integrations/kalvilearn/tickets/{ticketNumber}': {
      get: {
        summary: 'Get full ticket details by ticketNumber, UUID, or externalReferenceId',
        parameters: [
          { in: 'path', name: 'ticketNumber', required: true, schema: { type: 'string' }, example: 'TS-1024' }
        ],
        responses: {
          '200': { description: 'Ticket details retrieved successfully' },
          '404': { description: 'Ticket not found' }
        }
      }
    },
    '/integrations/kalvilearn/tickets': {
      get: {
        summary: 'Filter and list tickets with pagination',
        parameters: [
          { in: 'query', name: 'type', schema: { type: 'string' } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
          { in: 'query', name: 'priority', schema: { type: 'string' } },
          { in: 'query', name: 'portal', schema: { type: 'string' } },
          { in: 'query', name: 'search', schema: { type: 'string' } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          '200': { description: 'Filtered ticket list with pagination' }
        }
      }
    },
    '/integrations/kalvilearn/tickets/{ticketNumber}/status': {
      patch: {
        summary: 'Update ticket status (strictly enforced lifecycle transitions)',
        parameters: [
          { in: 'path', name: 'ticketNumber', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED', 'REJECTED']
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Status updated successfully' },
          '422': { description: 'Invalid lifecycle status transition' }
        }
      }
    },
    '/integrations/kalvilearn/export': {
      post: {
        summary: 'Export integration tickets, students, mentors, tasks, or analytics in PDF, DOCX, or CSV',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['format', 'resource'],
                properties: {
                  format: { type: 'string', enum: ['pdf', 'docx', 'csv'], example: 'pdf' },
                  resource: { type: 'string', enum: ['tickets', 'students', 'mentors', 'tasks', 'analytics'], example: 'tickets' },
                  filters: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      status: { type: 'string' },
                      priority: { type: 'string' },
                      portal: { type: 'string' },
                      search: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Generated binary export file (PDF, DOCX, or CSV)' },
          '400': { description: 'Invalid export format or resource' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden: Insufficient privileges' },
          '404': { description: 'No data available for export' },
          '429': { description: 'Export rate limit exceeded' }
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
