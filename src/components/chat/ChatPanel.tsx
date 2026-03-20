import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Plus, ArrowLeft, Trash2, Loader2, X, FileDown, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChatMessageBubble, splitChartBlocks } from './ChatMessage';
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
import type { ChatConversation, ChatMessage } from '@/types/chat';

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MOBILE_BREAKPOINT = 1024; // lg breakpoint — matches Layout.tsx

export function ChatPanel({ open, onOpenChange }: ChatPanelProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportTitulo, setExportTitulo] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);

  // Panel styles — responsive: on mobile, 90% height panel from bottom
  const panelStyle = useMemo(() => ({
    position: 'fixed' as const,
    top: isMobile ? '10dvh' : 0,
    right: 0,
    bottom: 0,
    width: isMobile ? '100%' : '50vw',
    maxWidth: '100%',
    minWidth: isMobile ? undefined : '400px',
    zIndex: 51,
    borderRadius: isMobile ? '1rem 1rem 0 0' : undefined,
  }), [isMobile]);

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

  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || isStreaming) return;

    setInput('');
    setShowHistory(false);

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

    let finalConversationId = currentConversationId;

    try {
      await sendChatMessage(currentConversationId, messageText, (event) => {
        if (event.type === 'text_delta' && event.content) {
          setStreamingContent((prev) => prev + event.content);
          scrollToBottom();
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
      });

      setStreamingContent((content) => {
        if (content) {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            conversation_id: finalConversationId || '',
            role: 'assistant',
            content,
            metadata: {},
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        return '';
      });

      if (finalConversationId && finalConversationId !== currentConversationId) {
        setCurrentConversationId(finalConversationId);
      }

      fetchConversations().then(setConversations).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar mensaje';
      toast.error(msg);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingContent('');
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

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: isMobile ? 'blur(2px)' : undefined,
        }}
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <div
        style={panelStyle}
        className="bg-background shadow-lg border-l"
      >
        <div className="flex h-full flex-col">
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
                <Button variant="ghost" size="icon" className="h-10 w-10 lg:h-8 lg:w-8" onClick={handleNewConversation}>
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
                <Button variant="ghost" size="icon" className="h-10 w-10 lg:h-8 lg:w-8" onClick={() => onOpenChange(false)}>
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
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
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
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
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
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {messages.length === 0 && !streamingContent ? (
                  <ChatEmptyState onSelectPrompt={(p) => handleSend(p)} />
                ) : (
                  <div className="flex flex-col gap-4 p-5">
                    {messages.map((msg) => (
                      <div key={msg.id} data-role={msg.role}>
                        <ChatMessageBubble role={msg.role} content={msg.content} />
                      </div>
                    ))}
                    {streamingContent && (
                      <ChatMessageBubble role="assistant" content={streamingContent} />
                    )}
                    {isStreaming && !streamingContent && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Consultando datos...
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
                  <Button
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isStreaming}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ExportarInformeDialog
        data={exportData}
        titulo={exportTitulo}
        onTituloChange={setExportTitulo}
        onClose={() => setExportData(null)}
      />
    </>
  );
}
