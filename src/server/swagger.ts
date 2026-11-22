export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Mission Planner API',
    version: '1.0.0',
    description:
      'UAV Mission Planner REST & Telemetry Ingest API. App endpoints use User Bearer JWT authentication, while External Ingest endpoints use separated X-API-Key authentication and broadcast real-time updates over Socket.IO.',
  },
  servers: [
    {
      url: '/',
      description: 'Current Mission Planner Server',
    },
  ],
  tags: [
    { name: 'App Auth', description: 'User-based operator authentication (JWT Bearer)' },
    { name: 'Missions', description: 'Mission configuration, parameters, and flight commands' },
    { name: 'Vehicles', description: 'Connected UAV vehicles & telemetry history' },
    { name: 'Logbook', description: 'Flight events & telemetry audit logs' },
    { name: 'API Keys', description: 'Manage external telemetry ingest API keys' },
    {
      name: 'External Ingest',
      description: 'External UAV/ground-station telemetry ingestion (X-API-Key auth only)',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Operator user session token obtained from /api/auth/login or /api/auth/register',
      },
      IngestApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'External system Ingest API Key (generated in Options -> Ingest API Keys or INGEST_API_KEY env)',
      },
    },
    schemas: {
      TelemetryIngestPayload: {
        type: 'object',
        required: ['vehicleCode', 'lat', 'lng'],
        properties: {
          vehicleCode: { type: 'string', example: 'Modelo AX3' },
          missionId: { type: 'integer', example: 1 },
          lat: { type: 'number', format: 'double', example: 46.54396 },
          lng: { type: 'number', format: 'double', example: 6.51754 },
          altitudeAmsl: { type: 'number', example: 446.5 },
          altitudeAto: { type: 'number', example: 118.3 },
          altitudeAtd: { type: 'number', example: 1.2 },
          speedKts: { type: 'number', example: 24.5 },
          groundSpeedMs: { type: 'number', example: 12.6 },
          airSpeedMs: { type: 'number', example: 13.1 },
          windSpeedMs: { type: 'number', example: 0.4 },
          gnssSpeedMs: { type: 'number', example: 0.15 },
          groundDistanceM: { type: 'number', example: 142.8 },
          headingDeg: { type: 'number', example: 315 },
          bearingDeg: { type: 'number', example: 12 },
          pitchDeg: { type: 'number', example: 2.1 },
          rollDeg: { type: 'number', example: -1.4 },
          voltage: { type: 'number', example: 14.3 },
          temperatureC: { type: 'number', example: 27.0 },
          mahUsed: { type: 'integer', example: 2663 },
          mahTotal: { type: 'integer', example: 4366 },
          batteryPercent: { type: 'integer', example: 86 },
          signalPercent: { type: 'integer', example: 75 },
          activeWaypointIndex: { type: 'integer', example: 12 },
          status: { type: 'string', enum: ['Connected', 'In Flight', 'Standby', 'Offline'], example: 'In Flight' },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['App Auth'],
        summary: 'Register a new operator account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'pilot@missionplanner.io' },
                  name: { type: 'string', example: 'Flight Operator' },
                  password: { type: 'string', minLength: 6, example: 'SecretPass123!' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created with JWT Bearer token' },
          '409': { description: 'Email already registered' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['App Auth'],
        summary: 'Sign in as an operator',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Authenticated with JWT Bearer token' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['App Auth'],
        summary: 'Get current operator profile',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Authenticated operator profile' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/missions': {
      get: {
        tags: ['Missions'],
        summary: 'List all missions in PostgreSQL',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Array of missions' } },
      },
    },
    '/api/missions/{id}': {
      patch: {
        tags: ['Missions'],
        summary: 'Update mission parameters or drawn waypoints and broadcast update via Socket.IO',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  missionType: { type: 'string', enum: ['Horizontal mapp.', 'Linear corridor', 'Custom path'] },
                  waypointsJson: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        seq: { type: 'integer' },
                        lat: { type: 'number' },
                        lng: { type: 'number' },
                        alt: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated mission' } },
      },
    },
    '/api/missions/{id}/command': {
      post: {
        tags: ['Missions'],
        summary: 'Execute flight command (play, pause, step, reset, lock, flag)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['command'],
                properties: {
                  command: { type: 'string', enum: ['play', 'pause', 'step', 'reset', 'toggle_lock', 'flag'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Command applied and broadcast via Socket.IO' } },
      },
    },
    '/api/vehicles': {
      get: {
        tags: ['Vehicles'],
        summary: 'List vehicles with current telemetry snapshot',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Array of vehicles' } },
      },
    },
    '/api/vehicles/{id}/telemetry': {
      get: {
        tags: ['Vehicles'],
        summary: 'Get historical telemetry points for Speed & Altitude graph',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 80 } },
        ],
        responses: { '200': { description: 'Telemetry time series' } },
      },
    },
    '/api/logs': {
      get: {
        tags: ['Logbook'],
        summary: 'Get flight logbook events',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Logbook entries' } },
      },
    },
    '/api/keys': {
      get: {
        tags: ['API Keys'],
        summary: 'List external ingest API keys (masked prefixes)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of ingest API keys' } },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Create a new external ingest API key',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'PX4 Mavlink Bridge' },
                  vehicleCode: { type: 'string', example: 'Modelo AX3' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Raw API key returned once' } },
      },
    },
    '/api/keys/{id}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Revoke an external ingest API key',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'API key revoked' } },
      },
    },
    '/api/v1/ingest/mission/{vehicleCode}': {
      get: {
        tags: ['External Ingest'],
        summary: 'Fetch active mission waypoints assigned to a vehicle',
        security: [{ IngestApiKeyAuth: [] }],
        parameters: [{ name: 'vehicleCode', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Assigned mission waypoints and type' } },
      },
    },
    '/api/v1/ingest/telemetry': {
      post: {
        tags: ['External Ingest'],
        summary: 'Ingest real-time UAV telemetry packet(s) from external systems',
        description:
          'Accepts either a single telemetry object or an array of telemetry objects. Persists into PostgreSQL and immediately broadcasts `telemetry:update` over Socket.IO to all connected Mission Planner clients.',
        security: [{ IngestApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/TelemetryIngestPayload' },
                  { type: 'array', items: { $ref: '#/components/schemas/TelemetryIngestPayload' } },
                ],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Telemetry ingested and broadcast in real-time' },
          '400': { description: 'Validation error' },
          '401': { description: 'Missing X-API-Key header' },
          '403': { description: 'Invalid or revoked X-API-Key' },
        },
      },
    },
    '/api/v1/ingest/mission-event': {
      post: {
        tags: ['External Ingest'],
        summary: 'Ingest mission lifecycle event from external autopilot',
        security: [{ IngestApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['vehicleCode', 'eventType', 'message'],
                properties: {
                  vehicleCode: { type: 'string', example: 'Modelo AX3' },
                  eventType: { type: 'string', example: 'WAYPOINT_REACHED' },
                  message: { type: 'string', example: 'Waypoint 14 reached with RTK fix' },
                  metadata: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Event recorded and broadcast over Socket.IO' },
        },
      },
    },
  },
};
