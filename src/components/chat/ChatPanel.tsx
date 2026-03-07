import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Plus, ArrowLeft, Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChatMessageBubble } from './ChatMessage';
import { ChatEmptyState } from './ChatEmptyState';
import {
  sendChatMessage,
  fetchConversations,
  fetchMessages,
  deleteConversation,
} from '@/utils/chatService';
import type { ChatConversation, ChatMessage } from '@/types/chat';

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatPanel({ open, onOpenChange }: ChatPanelProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        }}
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '50vw',
          maxWidth: '100%',
          minWidth: '400px',
          zIndex: 51,
        }}
        className="bg-background shadow-lg border-l"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b px-4 py-3">
            {showHistory ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowHistory(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold">Conversaciones</span>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setShowHistory(true)}
                >
                  Historial
                </Button>
                <span className="flex-1 truncate text-center text-sm font-semibold">
                  {currentTitle || 'Esco'}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNewConversation}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" />
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
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <span className="flex-1 truncate text-sm">
                      {conv.title || 'Sin titulo'}
                    </span>
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
                      <ChatMessageBubble key={msg.id} role={msg.role} content={msg.content} />
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
              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Pregunta sobre la finca..."
                    rows={1}
                    className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    style={{ maxHeight: '6rem', minHeight: '40px' }}
                    disabled={isStreaming}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isStreaming}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
