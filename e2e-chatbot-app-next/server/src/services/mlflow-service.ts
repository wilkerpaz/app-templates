// server/src/services/mlflow-service.ts
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
  const experimentId = process.env.DATABRICKS_SERVING_EXPERIMENT;
  
  if (!experimentId) {
    console.warn('[MLflow] Experiment ID not configured. Skipping trace.');
    return;
  }

  try {
    const token = await getDatabricksToken();
    const host = getHostUrl();
    const url = `${host}/api/2.0/mlflow/traces`;

    // Serializa inputs/outputs para garantir que o formato seja aceito
    const inputsJson = JSON.stringify([{ role: "user", content: payload.userInput }]);
    const outputsJson = JSON.stringify([{ role: "assistant", content: payload.modelOutput }]);

    const body = {
      experiment_id: experimentId,
      timestamp_ms: payload.startTime,
      execution_time_ms: payload.endTime - payload.startTime,
      request_metadata: {
        // --- CORREÇÃO AQUI ---
        // Usamos APENAS as chaves mlflow. que o Databricks usa para agrupar sessões.
        // Removemos chaves personalizadas que podem causar rejeição (user_email, model_name, etc)
        // Se precisar de email, coloque nas tags (tags é outro campo, mas vamos simplificar primeiro)
        "mlflow.traceConversationId": payload.chatId,
        "mlflow.traceRequestId": payload.messageId
      },
      // Tags são mais flexíveis para metadados personalizados
      tags: {
        "user_email": payload.userEmail || "anonymous",
        "source": "chat-app"
      },
      name: "chat_interaction",
      inputs: inputsJson,
      outputs: outputsJson,
      status: "OK"
    };

    console.log("[MLflow] Sending trace for conversation:", payload.chatId);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[MLflow ERROR] ${response.status}: ${errText}`);
    } else {
      console.log(`[MLflow SUCCESS] Trace logged.`);
    }

  } catch (error) {
    console.error('[MLflow FATAL ERROR]', error);
  }
}
