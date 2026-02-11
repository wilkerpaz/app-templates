// server/src/services/mlflow-service.ts
import { getDatabricksToken } from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

interface TracePayload {
  chatId: string;
  messageId: string;
  userInput: string;
  modelOutput: string;
  startTime: number; // epoch ms
  endTime: number;   // epoch ms
  userEmail?: string;
}

// Converte milissegundos em string protobuf Duration "Xs", ex.: 120 ms -> "0.120s"
function msToDurationStr(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  // 3 casas já é suficiente; protobuf aceita até 9
  return `${seconds.toFixed(3)}s`;
}

export async function logTraceToDatabricks(payload: TracePayload) {
  const experimentId = process.env.DATABRICKS_SERVING_EXPERIMENT;

  if (!experimentId) {
    console.warn('[MLflow] Experiment ID not configured.');
    return;
  }

  try {
    const token = await getDatabricksToken();
    const host = getHostUrl().replace(/\/+$/, '');
    const url = `${host}/api/3.0/mlflow/traces`;

    // Conteúdo de entrada/saída (strings JSON)
    const requestStr = JSON.stringify([
      { role: 'user', content: payload.userInput || '' },
    ]);
    const responseStr = JSON.stringify([
      { role: 'assistant', content: payload.modelOutput || '' },
    ]);

    // Campos temporais no formato exigido pelo endpoint V3
    const executionMs = Math.max(0, payload.endTime - payload.startTime);
    const requestTimeIso = new Date(payload.startTime).toISOString(); // RFC 3339 / UTC
    const executionDuration = msToDurationStr(executionMs);           // "Xs"

    const body = {
      trace: {
        trace_info: {
          // Local de armazenamento do trace (MLflow Experiment)
          trace_location: {
            mlflow_experiment: {
              experiment_id: experimentId,
            },
          },

          // >>> Campos exigidos pelo StartTrace V3 <<<
          request_time: requestTimeIso,          // ex.: "2026-02-11T00:23:35.925Z"
          execution_duration: executionDuration, // ex.: "0.120s"
          state: 'OK',                           // se IN_PROGRESS, omita execution_duration

          // Identidade/contexto úteis
          experiment_id: experimentId,
          name: 'chat_interaction',
          client_request_id: payload.messageId,

          // >>> Metadados padronizados para preencher colunas "Session"/"User" na UI
          trace_metadata: {
            'mlflow.trace.session': payload.chatId,
            'mlflow.trace.user': payload.userEmail ?? 'unknown',
          },

          // (Opcional) Tags para filtros livres na UI; não impactam Session/User
          // tags: { any_key: 'any_value' },
        },

        trace_data: {
          // Dados completos (UI deriva request/response preview)
          request: requestStr,
          response: responseStr,
          spans: [], // adicione spans filhos aqui (retrieval/llm_call/rerank) se quiser observabilidade detalhada
        },
      },
    };

    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        '[MLflow] POST /traces body (preview):',
        JSON.stringify(body).slice(0, 500),
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[MLflow ERROR] ${response.status}: ${errText}`);
    } else {
      console.log(`[MLflow SUCCESS] Trace logged successfully.`);
    }
  } catch (error) {
    console.error('[MLflow FATAL ERROR]', error);
  }
}