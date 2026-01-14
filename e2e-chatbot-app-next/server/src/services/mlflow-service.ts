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
  const endpointName = process.env.DATABRICKS_SERVING_ENDPOINT || "unknown-endpoint";
  
  if (!experimentId) {
    console.warn('[MLflow] Experiment ID not configured. Skipping trace.');
    return;
  }

  try {
    const token = await getDatabricksToken();
    const host = getHostUrl();
    const url = `${host}/api/2.0/mlflow/traces`;

    // Vamos garantir que inputs e outputs sejam strings JSON válidas
    // A API de trace geralmente prefere strings serializadas para inputs complexos
    const inputsJson = JSON.stringify([{ role: "user", content: payload.userInput }]);
    const outputsJson = JSON.stringify([{ role: "assistant", content: payload.modelOutput }]);

    const body = {
      experiment_id: experimentId,
      timestamp_ms: payload.startTime,
      execution_time_ms: payload.endTime - payload.startTime,
      request_metadata: {
        // --- CAMPOS CRÍTICOS ---
        // O Databricks frequentemente exige 'request_id' e 'conversation_id' 
        // explícitos além das tags do MLflow para a UI de Sessions funcionar.
        "request_id": payload.messageId,
        "conversation_id": payload.chatId,
        "model_name": endpointName, // Ajuda a identificar a origem
        // Tags padrão do MLflow para compatibilidade
        "mlflow.traceConversationId": payload.chatId,
        "mlflow.traceRequestId": payload.messageId,
        "user_email": payload.userEmail || "anonymous"
      },
      name: "chat_interaction",
      // Enviando como strings JSON para evitar erros de schema em objetos complexos
      inputs: inputsJson,
      outputs: outputsJson,
      status: "OK"
    };

    // --- LOG DE DEBUG ---
    console.log("---------------------------------------------------");
    console.log("[MLflow DEBUG] Enviando Trace para:", url);
    console.log("[MLflow DEBUG] Experiment ID:", experimentId);
    console.log("[MLflow DEBUG] Payload:", JSON.stringify(body, null, 2));
    console.log("---------------------------------------------------");

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
      console.error("---------------------------------------------------");
      console.error(`[MLflow ERROR] Status: ${response.status}`);
      console.error(`[MLflow ERROR] Response: ${errText}`);
      console.error("---------------------------------------------------");
    } else {
      const data = await response.json();
      console.log(`[MLflow SUCCESS] Trace registrado! ID: ${data.trace?.info?.request_id || 'ok'}`);
    }

  } catch (error) {
    console.error('[MLflow FATAL ERROR]', error);
  }
}
