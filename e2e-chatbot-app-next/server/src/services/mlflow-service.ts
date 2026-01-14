import { getDatabricksToken } from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

interface TracePayload {
  chatId: string;
  messageId: string;
  userInput: string;
  modelOutput: string;
  startTime: number;
  endTime: number;
  userEmail?: string;
}

export async function logTraceToDatabricks(payload: TracePayload) {
  const experimentId = process.env.DATABRICKS_SERVING_EXPERIMENT; // Definido no app.yaml ou .env
  
  if (!experimentId) {
    console.warn('[MLflow] Experiment ID not configured. Skipping trace logging.');
    return;
  }

  try {
    const token = await getDatabricksToken();
    const host = getHostUrl();
    const endpoint = `${host}/api/2.0/mlflow/traces`;

    // Estrutura exigida pela API de Tracing do Databricks
    const body = {
      experiment_id: experimentId,
      timestamp_ms: payload.startTime,
      execution_time_ms: payload.endTime - payload.startTime,
      request_metadata: {
        // O SEGREDO ESTÁ AQUI: Estes 2 campos vinculam a sessão no Databricks
        "mlflow.traceConversationId": payload.chatId,
        "mlflow.traceRequestId": payload.messageId, 
        "user_email": payload.userEmail || "anonymous"
      },
      name: "chat_interaction",
      inputs: {
        content: payload.userInput,
        role: "user"
      },
      outputs: {
        content: payload.modelOutput,
        role: "assistant"
      },
      status: "OK"
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[MLflow] Failed to log trace: ${err}`);
    } else {
      console.log(`[MLflow] Trace logged successfully for chat ${payload.chatId}`);
    }

  } catch (error) {
    console.error('[MLflow] Error logging trace:', error);
  }
}