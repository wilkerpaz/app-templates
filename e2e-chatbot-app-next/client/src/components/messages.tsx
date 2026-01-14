import { PreviewMessage, AwaitingResponseMessage } from './message';
import { Greeting } from './greeting';
import { memo, useEffect } from 'react';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { useMessages } from '@/hooks/use-messages';
import type { ChatMessage } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import { Conversation, ConversationContent } from './elements/conversation';
import { ArrowDownIcon } from 'lucide-react';
import { DATABRICKS_TOOL_CALL_ID } from '@chat-template/ai-sdk-providers/tools';

// --- FUNÇÕES DE LIMPEZA (FILTRO DE AGENTES) ---

const isNamePart = (part: any) =>
  part.type === 'text' &&
  part.text?.startsWith('<name>') &&
  part.text?.endsWith('</name>');

const formatNamePart = (part: any) =>
  part.text?.replace('<name>', '').replace('</name>', '');

/**
 * Filtra a mensagem para remover ruídos de sub-agentes.
 * Converte chamadas de ferramentas em texto legível.
 */
function sanitizeMessage(message: ChatMessage): ChatMessage {
  // Não filtramos mensagens do usuário
  if (message.role === 'user' || !message.parts) return message;

  const cleanParts: typeof message.parts = [];

  // Começa TRUE para permitir frases iniciais
  let isContentAllowed = true;

  for (const part of message.parts) {
    // 1. Remove erros de sistema
    if (part.type === 'data-error') continue;

    // 2. TRATAMENTO DE FERRAMENTAS (TOOL CALLS)
    if (part.type === `tool-${DATABRICKS_TOOL_CALL_ID}`) {
      // Tenta extrair o "request" do input
      const inputRequest = (part.input as any)?.request;

      // Se existir um request e o conteúdo estiver permitido (agente principal falando),
      // transformamos isso em um texto bonitinho para o usuário ver.
      if (inputRequest && isContentAllowed) {
        cleanParts.push({
          type: 'text',
          text: `\n>"${inputRequest}"\n\n`, // Markdown de citação
        } as any);
      }
      
      // Continuamos ignorando a caixa cinza original (técnica)
      continue;
    }

    // 3. Lógica do Semáforo baseada no NOME (<name>...</name>)
    if (part.type === 'text' && isNamePart(part)) {
      const name = formatNamePart(part);

      // Padrão Databricks:
      // ma- / sa- = Principal -> MOSTRAR
      // Outros = Sub-agente -> ESCONDER
      if (name?.startsWith('ma-') || name?.startsWith('sa-')) {
        isContentAllowed = true; // Sinal Verde
      } else {
        isContentAllowed = false; // Sinal Vermelho
      }

      continue; // Remove a tag <name>
    }

    // 4. Filtro de Texto
    if (part.type === 'text') {
      if (isContentAllowed) {
        cleanParts.push(part);
      }
      continue;
    }

    // 5. Outros tipos passam direto
    cleanParts.push(part);
  }

  return { ...message, parts: cleanParts };
}

// --- FIM DAS FUNÇÕES ---

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers<ChatMessage>['status'];
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolResult: UseChatHelpers<ChatMessage>['addToolResult'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  selectedModelId: string;
}

function PureMessages({
  chatId,
  status,
  messages,
  setMessages,
  addToolResult,
  sendMessage,
  regenerate,
  isReadonly,
  selectedModelId,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });

  useDataStream();

  useEffect(() => {
    if (status === 'submitted') {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth',
          });
        }
      });
    }
  }, [status, messagesContainerRef]);

  return (
    <div
      ref={messagesContainerRef}
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      style={{ overflowAnchor: 'none' }}
    >
      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {messages.length === 0 && <Greeting />}

          {messages.map((rawMessage, index) => {
            const cleanMessage = sanitizeMessage(rawMessage);

            if (cleanMessage.parts.length === 0) return null;

            return (
              <PreviewMessage
                key={cleanMessage.id}
                chatId={chatId}
                message={cleanMessage}
                isLoading={
                  status === 'streaming' && messages.length - 1 === index
                }
                setMessages={setMessages}
                addToolResult={addToolResult}
                sendMessage={sendMessage}
                regenerate={regenerate}
                isReadonly={isReadonly}
                requiresScrollPadding={
                  hasSentMessage && index === messages.length - 1
                }
              />
            );
          })}

          {status === 'submitted' &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' &&
            selectedModelId !== 'chat-model-reasoning' && (
              <AwaitingResponseMessage />
            )}

          <div
            ref={messagesEndRef}
            className="min-h-[24px] min-w-[24px] shrink-0"
          />
        </ConversationContent>
      </Conversation>

      {!isAtBottom && (
        <button
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom('smooth')}
          type="button"
          aria-label="Scroll to bottom"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.selectedModelId !== nextProps.selectedModelId) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;

  return false;
});
