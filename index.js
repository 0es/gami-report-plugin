'use strict';

const { generateReport } = require('./report');

const DEFAULT_API_KEY = 'api_key';

const BASE_URLS = {
  test: 'https://test-op-api.gami.vip',
  prod: 'https://op-api.gami.vip',
};

/**
 * Fetch paginated stat data from a single endpoint (collects all pages).
 */
async function fetchAllPages(baseUrl, endpoint, body, apiKey) {
  const url = `${baseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  let pageIndex = 1;
  const pageSize = 50;
  let allItems = [];

  while (true) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, pageIndex, pageSize }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${endpoint}`);
    }

    const json = await res.json();
    if (!json.success) {
      throw new Error(`API error from ${endpoint}: ${json.message ?? 'unknown'}`);
    }

    const items = json.data?.items ?? [];
    allItems = allItems.concat(items);

    const total = json.data?.total ?? 0;
    if (allItems.length >= total || items.length === 0) break;
    pageIndex++;
  }

  return allItems;
}

module.exports = function register(api) {
  api.registerTool({
    name: 'generate_gami_report',
    description:
      'Generate a Gami platform statistical report image covering user data, order data, and playmate data. ' +
      'Returns the local file path of the generated PNG image that can be sent as a media message.',
    parameters: {
      type: 'object',
      properties: {
        reportType: {
          type: 'number',
          enum: [0, 1, 2],
          description: 'Report granularity: 0 = daily (日报), 1 = weekly (周报), 2 = monthly (月报)',
        },
        startDay: {
          type: 'string',
          description: 'Start date in yyyy-MM-dd format (inclusive)',
        },
        endDay: {
          type: 'string',
          description: 'End date in yyyy-MM-dd format (inclusive)',
        },
        env: {
          type: 'string',
          enum: ['test', 'prod'],
          description: 'API environment override. Defaults to the plugin config value (prod if not set).',
        },
      },
      required: ['reportType', 'startDay', 'endDay'],
    },
    async execute(_id, params) {
      const { reportType, startDay, endDay } = params;

      // Resolve config: param > plugin config > defaults
      const pluginConfig = api.config?.plugins?.entries?.['gami-report']?.config ?? {};
      const env = params.env ?? pluginConfig.env ?? 'prod';
      const apiKey = pluginConfig.apiKey ?? DEFAULT_API_KEY;
      const baseUrl = BASE_URLS[env] ?? BASE_URLS.prod;

      const queryBody = { startDay, endDay, type: reportType };

      let userData, orderData, playmateData;
      try {
        [userData, orderData, playmateData] = await Promise.all([
          fetchAllPages(baseUrl, '/inner-api/userDataStatPage', queryBody, apiKey),
          fetchAllPages(baseUrl, '/inner-api/orderDataStatPage', queryBody, apiKey),
          fetchAllPages(baseUrl, '/inner-api/playmateDataStatPage', queryBody, apiKey),
        ]);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to fetch report data: ${err.message}` }],
          isError: true,
        };
      }

      if (!userData.length && !orderData.length && !playmateData.length) {
        return {
          content: [
            {
              type: 'text',
              text: `No data available for ${startDay} ~ ${endDay} (type=${reportType}, env=${env}).`,
            },
          ],
        };
      }

      let imagePath;
      try {
        imagePath = await generateReport({
          reportType,
          startDay,
          endDay,
          userData,
          orderData,
          playmateData,
        });
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Failed to generate report image: ${err.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              imagePath,
              env,
              reportType,
              startDay,
              endDay,
              counts: {
                userRecords: userData.length,
                orderRecords: orderData.length,
                playmateRecords: playmateData.length,
              },
            }),
          },
        ],
      };
    },
  });
};
