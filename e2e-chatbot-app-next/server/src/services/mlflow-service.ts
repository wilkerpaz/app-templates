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

    // Serializa inputs/outputs para garantir formato JSON string
    const inputsJson = JSON.stringify([{ role: "user", content: payload.userInput || "" }]);
    const outputsJson = JSON.stringify([{ role: "assistant", content: payload.modelOutput || "" }]);

    const body = {
      experiment_id: experimentId,
      timestamp_ms: payload.startTime,
      execution_time_ms: payload.endTime - payload.startTime,
      request_metadata: {
        // --- AQUI ESTÁ A CORREÇÃO BASEADA NA SUA IMAGEM ---
        // Usando exatamente as chaves que a documentação pede
        "mlflow.trace.session": payload.chatId,
        "mlflow.trace.user": payload.userEmail || "unknown",
        // Adicionamos o Request ID para garantir unicidade da mensagem
        "mlflow.trace.request": payload.messageId
      },
      name: "chat_interaction",
      inputs: inputsJson,
      outputs: outputsJson,
      status: "OK"
    };

    console.log("[MLflow] Sending trace for Session ID:", payload.chatId);

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
      console.log(`[MLflow SUCCESS] Trace logged successfully.`);
    }

  } catch (error) {
    console.error('[MLflow FATAL ERROR]', error);
  }
}
