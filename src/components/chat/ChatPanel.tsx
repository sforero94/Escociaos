import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Plus, ArrowLeft, Trash2, X, FileDown, Pencil, Check, Square } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ChatMessageView, ChatMessageAcciones, splitChartBlocks } from './ChatMessage';
import { EscoTraza } from './EscoTraza';
import { EscoMemoriaAprobacion } from './EscoMemoriaAprobacion';
import { ExportarInformeDialog } from './ExportarInformeDialog';
import type { ExportData } from './ExportarInformeDialog';
import { ChatEmptyState } from './ChatEmptyState';
import { generarTituloInforme } from '@/utils/generarTituloInforme';
import {
  sendChatMessage,
  fetchConversations,
  fetchMessages,
  deleteConversation,
  renameConversation,
} from '@/utils/chatService';
import type { ChatConversation, ChatMessage, PasoTraza } from '@/types/chat';

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MOBILE_BREAKPOINT = 1024; // lg breakpoint — matches Layout.tsx

/** Forma con la que el servidor persiste cada llamada en `chat_messages.metadata`. */
interface ToolInteractionPersistida {
  tool: string;
  args?: Record<string, unknown>;
  result_summary?: string;
}

/**
 * Traza de un mensaje ya respondido.
 *
 * Dos fuentes, en orden de preferencia:
 *
 *  1. `metadata.traza` — la que el cliente armó en vivo con los eventos SSE.
 *     Trae duraciones reales, pero solo existe mientras dure la sesión.
 *  2. `metadata.tool_interactions` — la que el servidor persiste en cada
 *     respuesta para reinyectarla en el turno siguiente. No trae duraciones,
 *     pero sobrevive a recargar y a reabrir una conversación vieja.
 *
 * La segunda ya se guardaba desde antes de este módulo; simplemente nadie la
 * leía. Es lo que hace que la trazabilidad no se evapore al cerrar el panel.
 */
function trazaDeMensaje(msg: ChatMessage): PasoTraza[] | null {
  const enVivo = msg.metadata?.traza;
  if (Array.isArray(enVivo) && enVivo.length > 0) return enVivo as PasoTraza[];

  const persistida = msg.metadata?.tool_interactions;
  if (!Array.isArray(persistida) || persistida.length === 0) return null;

  return (persistida as ToolInteractionPersistida[])
    .filter((t) => typeof t?.tool === 'string')
    .map((t, i) => ({ index: i, tool: t.tool, args: t.args }));
}

/**
 * Memoria que Esco propuso guardar en este turno y que nadie confirmó todavía.
 *
 * `propose_memory_save` no escribe nada: deja la propuesta para que el cliente
 * la confirme. El contenido viaja en los `args` de la llamada, así que la traza
 * — en vivo o rehidratada — ya lo tiene y no hace falta el token que usa
 * Telegram para rescatarlo del cache del servidor.
 */
function memoriaPropuesta(pasos: PasoTraza[] | null): string | null {
  const paso = pasos?.find((p) => p.tool === 'propose_memory_save');
  const content = paso?.args?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

export function ChatPanel({ open, onOpenChange }: ChatPanelProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  // La traza vive en un ref además del estado: el estado es para pintarla, y el
  // ref para poder leerla al cerrar el mensaje sin quedar atrapado en el closure
  // de `handleSend`.
  const [traza, setTraza] = useState<PasoTraza[]>([]);
  const trazaRef = useRef<PasoTraza[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportTitulo, setExportTitulo] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Última pregunta enviada, para el botón «Reintentar». */
  const ultimaPreguntaRef = useRef<string>('');

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // El bloqueo de scroll del fondo lo hace Radix Dialog. Antes se hacía a mano
  // moviendo `document.body.style.position` a `fixed` y restaurando el scrollY,
  // que además de frágil dejaba el panel sin trampa de foco ni cierre con Escape.

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, []);

  // Load conversations list
  useEffect(() => {
    if (open) {
      fetchConversations().then(setConversations).catch(() => {});
    }
  }, [open]);

  // Load messages when switching conversation
  useEffect(() => {
    if (currentConversationId) {
      fetchMessages(currentConversationId).then((msgs) => {
        setMessages(msgs);
        scrollToBottom();
      }).catch(() => {});
    } else {
      setMessages([]);
    }
  }, [currentConversationId, scrollToBottom]);

  useEffect(() => {
    if (open && !isStreaming) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, isStreaming, currentConversationId]);

  // Cortar el stream si el panel se cierra a mitad de una respuesta.
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || isStreaming) return;

    setInput('');
    setShowHistory(false);
    ultimaPreguntaRef.current = messageText;

    const tempUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: currentConversationId || '',
      role: 'user',
      content: messageText,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    scrollToBottom();

    setIsStreaming(true);
    setStreamingContent('');
    trazaRef.current = [];
    setTraza([]);

    const controller = new AbortController();
    abortRef.current = controller;

    let finalConversationId = currentConversationId;

    const actualizarTraza = (mutar: (pasos: PasoTraza[]) => PasoTraza[]) => {
      trazaRef.current = mutar(trazaRef.current);
      setTraza(trazaRef.current);
    };

    try {
      await sendChatMessage(currentConversationId, messageText, (event) => {
        if (event.type === 'text_delta' && event.content) {
          setStreamingContent((prev) => prev + event.content);
          scrollToBottom();
        } else if (event.type === 'tool_start' && event.tool) {
          actualizarTraza((pasos) => [
            ...pasos,
            { index: event.index ?? pasos.length, tool: event.tool!, args: event.args },
          ]);
          scrollToBottom();
        } else if (event.type === 'tool_done') {
          actualizarTraza((pasos) =>
            pasos.map((p) => (p.index === event.index ? { ...p, ms: event.ms, ok: event.ok } : p)),
          );
        } else if (event.type === 'done') {
          if (event.conversation_id) {
            finalConversationId = event.conversation_id;
          }
          if (event.title) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === finalConversationId ? { ...c, title: event.title! } : c,
              ),
            );
          }
        } else if (event.type === 'error') {
          toast.error(event.message || 'Error del asistente');
        }
      }, controller.signal);

      // Se captura ANTES del updater: React lo ejecuta en la fase de render, o sea
      // después de que la línea que limpia el ref ya corrió. Leer `trazaRef.current`
      // adentro devolvía siempre el array vacío y la traza desaparecía al llegar la
      // respuesta, en vez de asentarse encima de ella.
      const trazaDeEsteTurno = trazaRef.current;

      setStreamingContent((content) => {
        if (content) {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            conversation_id: finalConversationId || '',
            role: 'assistant',
            content,
            // La traza queda pegada a su respuesta: al terminar se asienta
            // colapsada arriba del mensaje en vez de desaparecer.
            metadata: { traza: trazaDeEsteTurno },
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        return '';
      });
      trazaRef.current = [];
      setTraza([]);

      if (finalConversationId && finalConversationId !== currentConversationId) {
        setCurrentConversationId(finalConversationId);
      }

      fetchConversations().then(setConversations).catch(() => {});
    } catch (err: unknown) {
      // Detener no es un error: el usuario lo pidió.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStreamingContent('');
        setTraza([]);
        trazaRef.current = [];
      } else {
        const msg = err instanceof Error ? err.message : 'Error al enviar mensaje';
        toast.error(msg);
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleDetener = () => {
    abortRef.current?.abort();
  };

  const handleReintentar = useCallback(() => {
    const pregunta = ultimaPreguntaRef.current;
    if (!pregunta || isStreaming) return;
    // Se quita el último turno (pregunta + respuesta) para no duplicarlo.
    setMessages((prev) => {
      const copia = [...prev];
      while (copia.length && copia[copia.length - 1].role === 'assistant') copia.pop();
      if (copia.length && copia[copia.length - 1].role === 'user') copia.pop();
      return copia;
    });
    handleSend(pregunta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  const handleNewConversation = () => {
    abortRef.current?.abort();
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingContent('');
    setTraza([]);
    trazaRef.current = [];
    setShowHistory(false);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
    setStreamingContent('');
    setShowHistory(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        handleNewConversation();
      }
    } catch {
      toast.error('Error al eliminar conversacion');
    }
  };

  const handleStartRename = (conv: ChatConversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title || '');
  };

  const handleConfirmRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await renameConversation(renamingId, renameValue.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === renamingId ? { ...c, title: renameValue.trim() } : c)),
      );
    } catch {
      toast.error('Error al renombrar conversacion');
    }
    setRenamingId(null);
  };

  const handleExport = useCallback(() => {
    // Find last assistant message
    const lastAssistantIdx = messages.reduce((lastIdx, m, i) => m.role === 'assistant' ? i : lastIdx, -1);
    if (lastAssistantIdx === -1) return;

    const assistantMsg = messages[lastAssistantIdx];
    const bloques = splitChartBlocks(assistantMsg.content);

    // Find the preceding user question
    const userQuestion = messages
      .slice(0, lastAssistantIdx)
      .reverse()
      .find((m) => m.role === 'user')?.content ?? '';

    // Find the bubble DOM element (last assistant bubble in the scroll container)
    const bubbles = scrollRef.current?.querySelectorAll<HTMLElement>('[data-role="assistant"]');
    const bubbleEl = bubbles?.[bubbles.length - 1];
    if (!bubbleEl) return;

    setExportTitulo(generarTituloInforme(userQuestion));
    setExportData({ bloques, userQuestion, bubbleElement: bubbleEl });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentTitle = conversations.find((c) => c.id === currentConversationId)?.title;
  const ultimoAsistenteIdx = messages.reduce(
    (ultimo, m, i) => (m.role === 'assistant' ? i : ultimo),
    -1,
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          // `[&>button]:hidden` oculta la X que trae SheetContent: se superpondría
          // con la del encabezado propio, que además lleva la etiqueta en español.
          className={
            'gap-0 p-0 [&>button]:hidden ' +
            (isMobile
              ? 'h-[90dvh] rounded-t-2xl'
              : 'w-[50vw] min-w-[400px] sm:max-w-none')
          }
          onOpenAutoFocus={(ev) => {
            // El foco va al campo de texto, no al primer botón del encabezado.
            ev.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {/* Radix exige un título accesible; el visible vive en el encabezado. */}
          <SheetTitle className="sr-only">{currentTitle || 'Esco, asistente de datos'}</SheetTitle>
          <SheetDescription className="sr-only">
            Preguntá sobre labores, monitoreo, finanzas, hato y clima de la finca.
          </SheetDescription>

          <div className="flex h-full min-h-0 flex-col">
            {/* Header */}
            <div className="flex items-center gap-1 border-b px-4 lg:px-4 py-3">
              {showHistory ? (
                <>
                  <Button variant="ghost" size="icon" className="h-10 w-10 lg:h-8 lg:w-8" onClick={() => setShowHistory(false)}>
                    <ArrowLeft className="h-5 w-5 lg:h-4 lg:w-4" />
                  </Button>
                  <span className="text-sm font-semibold ml-1">Conversaciones</span>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 lg:h-8 px-3 text-xs text-muted-foreground"
                    onClick={() => setShowHistory(true)}
                  >
                    Historial
                  </Button>
                  <span className="flex-1 truncate text-center text-sm font-semibold">
                    {currentTitle || 'Esco'}
                  </span>
                  <Button variant="ghost" size="icon" className="h-10 w-10 lg:h-8 lg:w-8" onClick={handleNewConversation} title="Nueva conversación">
                    <Plus className="h-5 w-5 lg:h-4 lg:w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 lg:h-8 lg:w-8"
                    onClick={handleExport}
                    disabled={!messages.some((m) => m.role === 'assistant')}
                    title="Exportar como informe"
                  >
                    <FileDown className="h-5 w-5 lg:h-4 lg:w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10 lg:h-8 lg:w-8" onClick={() => onOpenChange(false)} title="Cerrar">
                    <X className="h-5 w-5 lg:h-4 lg:w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Body */}
            {showHistory ? (
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-1 p-2">
                  {conversations.length === 0 && (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      Sin conversaciones aun
                    </p>
                  )}
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted cursor-pointer"
                      onClick={() => renamingId !== conv.id && handleSelectConversation(conv.id)}
                    >
                      {renamingId === conv.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          onBlur={handleConfirmRename}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 rounded border bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <span className="flex-1 truncate text-sm">
                          {conv.title || 'Sin titulo'}
                        </span>
                      )}
                      {renamingId === conv.id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(ev: React.MouseEvent) => {
                            ev.stopPropagation();
                            handleConfirmRename();
                          }}
                        >
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={(ev: React.MouseEvent) => {
                              ev.stopPropagation();
                              handleStartRename(conv);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={(ev: React.MouseEvent) => {
                              ev.stopPropagation();
                              handleDeleteConversation(conv.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                  {messages.length === 0 && !streamingContent && !isStreaming ? (
                    <ChatEmptyState onSelectPrompt={(p) => handleSend(p)} />
                  ) : (
                    <div className="flex flex-col gap-4 p-5">
                      {messages.map((msg, idx) => {
                        const trazaMsg = trazaDeMensaje(msg);
                        const esUltimoAsistente = idx === ultimoAsistenteIdx;
                        const propuesta = msg.role === 'assistant' ? memoriaPropuesta(trazaMsg) : null;

                        return (
                          <div key={msg.id} className="flex flex-col gap-2">
                            {trazaMsg && (
                              <div className="pl-9">
                                <EscoTraza pasos={trazaMsg} trabajando={false} />
                              </div>
                            )}
                            {/* `data-role` envuelve SOLO la respuesta: `handleExport`
                                lo usa para capturar el nodo del informe, y ni la
                                traza ni las acciones son parte del informe. */}
                            <div data-role={msg.role}>
                              <ChatMessageView role={msg.role} content={msg.content} />
                            </div>
                            {msg.role === 'assistant' && (
                              <ChatMessageAcciones
                                contenido={msg.content}
                                onReintentar={esUltimoAsistente && !isStreaming ? handleReintentar : undefined}
                              />
                            )}
                            {propuesta && (
                              <div className="pl-9">
                                {/* La tarjeta se queda montada al resolverse: se
                                    convierte en su propio acuse («Guardado en la
                                    memoria de Esco»). Desmontarla dejaba al
                                    usuario sin saber si había quedado o no. */}
                                <EscoMemoriaAprobacion propuesta={propuesta} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {isStreaming && (
                        <div className="flex flex-col gap-2">
                          {/* `pl-9` alinea la traza con el texto de la respuesta
                              (avatar de 28 px + 8 px de gap). */}
                          <div className="pl-9">
                            <EscoTraza pasos={traza} trabajando={!streamingContent} />
                          </div>
                          {streamingContent && (
                            <ChatMessageView role="assistant" content={streamingContent} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input */}
                <div
                  className="border-t px-4 pt-3"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
                >
                  <div className="flex items-end gap-3">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Pregunta sobre la finca..."
                      rows={1}
                      className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ maxHeight: '6rem', minHeight: '44px' }}
                      disabled={isStreaming}
                    />
                    {isStreaming ? (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11 shrink-0 rounded-xl"
                        onClick={handleDetener}
                        title="Detener"
                        aria-label="Detener la respuesta"
                      >
                        <Square className="h-4 w-4 fill-current" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl"
                        onClick={() => handleSend()}
                        disabled={!input.trim()}
                        aria-label="Enviar"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ExportarInformeDialog
        data={exportData}
        titulo={exportTitulo}
        onTituloChange={setExportTitulo}
        onClose={() => setExportData(null)}
      />
    </>
  );
}
