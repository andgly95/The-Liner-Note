"use client";

import { useChat, type Message } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Store, Send, Loader2, User, Plus, MessageSquare, Trash2, AlertCircle, Square, RotateCcw, Download } from "lucide-react";
import { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

interface RecordShopChatProps {
  collectionString: string;
  wantlistString?: string;
  isReady: boolean;
}

interface SavedConversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "linernote-conversations";

// Rendered as a static UI bubble before any real messages exist. Not part of chat
// state — Anthropic's Messages API rejects requests whose first message isn't `user`.
const WELCOME_TEXT = "Hey there! Welcome to the shop. I've had a look at your collection - you've got some great stuff in there. What can I help you with today? Looking for pressing advice, hunting for something specific, or just want to chat records?";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function safeWriteStorage(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch (e) {
    console.warn("Failed to persist conversations (likely localStorage quota):", e);
  }
}

function getConversationTitle(messages: Message[]): string {
  const firstUserMessage = messages.find(m => m.role === "user");
  if (firstUserMessage) {
    const content = firstUserMessage.content;
    return content.length > 40 ? content.substring(0, 40) + "..." : content;
  }
  return "New conversation";
}

export function RecordShopChat({ collectionString, wantlistString, isReady }: RecordShopChatProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const currentConversationIdRef = useRef<string | null>(null);
  const isSwitchingRef = useRef(false);

  // Load conversations from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as SavedConversation[];
      setConversations(parsed);
      if (parsed.length > 0) {
        const mostRecent = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        // Suppress the persist effect through the post-mount remount; otherwise it
        // re-saves the just-loaded conversation and bumps updatedAt for nothing.
        isSwitchingRef.current = true;
        setCurrentConversationId(mostRecent.id);
        currentConversationIdRef.current = mostRecent.id;
        setChatKey(prev => prev + 1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { isSwitchingRef.current = false; });
        });
      }
    } catch (e) {
      console.error("Failed to parse saved conversations:", e);
    }
  }, []);

  // Get current conversation's messages for initialMessages
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const initialMessages = currentConversation?.messages || [];

  const { messages, input, setInput, setMessages, handleSubmit, isLoading, error, stop, reload } = useChat({
    api: "/api/chat",
    body: {
      collection: collectionString,
      wantlist: wantlistString,
    },
    initialMessages,
    id: `chat-${chatKey}`,
  });

  // Persist messages — creates a new conversation on first call, updates thereafter.
  const persistMessages = useCallback((msgs: Message[]) => {
    if (msgs.length === 0) return;
    const convId = currentConversationIdRef.current;
    setConversations(prev => {
      let updated: SavedConversation[];
      if (convId) {
        if (!prev.some(c => c.id === convId)) return prev;
        updated = prev.map(c =>
          c.id === convId
            ? { ...c, messages: msgs, title: getConversationTitle(msgs), updatedAt: Date.now() }
            : c
        );
      } else {
        const newId = generateId();
        const newConv: SavedConversation = {
          id: newId,
          title: getConversationTitle(msgs),
          messages: msgs,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        updated = [newConv, ...prev];
        setCurrentConversationId(newId);
        currentConversationIdRef.current = newId;
      }
      safeWriteStorage(JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Save once per turn — gated on !isLoading so we don't write on every streamed token.
  useEffect(() => {
    if (isLoading || isSwitchingRef.current) return;
    if (messages.length === 0) return;
    persistMessages(messages);
  }, [isLoading, messages, persistMessages]);

  // Radix ScrollArea forwards refs to its Root (overflow-hidden); the actual scroll
  // container is the Viewport, which we have to query for.
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
      "[data-radix-scroll-area-viewport]"
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
    // Ctrl+Enter or Shift+Enter adds a new line (default behavior)
  };

  const startNewConversation = useCallback(() => {
    if (isLoading) stop();
    isSwitchingRef.current = true;
    setCurrentConversationId(null);
    currentConversationIdRef.current = null;
    setChatKey(prev => prev + 1);
    setMessages([]);
    setInput("");
    requestAnimationFrame(() => { isSwitchingRef.current = false; });
  }, [isLoading, stop, setMessages, setInput]);

  const loadConversation = useCallback((conv: SavedConversation) => {
    if (isLoading) stop();
    isSwitchingRef.current = true;
    setCurrentConversationId(conv.id);
    currentConversationIdRef.current = conv.id;
    setChatKey(prev => prev + 1);
    setMessages(conv.messages);
    setInput("");
    setShowHistory(false);
    requestAnimationFrame(() => { isSwitchingRef.current = false; });
  }, [isLoading, stop, setMessages, setInput]);

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      safeWriteStorage(JSON.stringify(updated));
      return updated;
    });
    if (currentConversationId === id) {
      startNewConversation();
    }
  };

  const exportConversation = useCallback(() => {
    if (messages.length === 0) return;
    const title =
      currentConversation?.title || getConversationTitle(messages) || "conversation";
    const lines = [
      `# Record Shop — ${title}`,
      "",
      `_Exported ${new Date().toLocaleString()}_`,
      "",
      ...messages.map((m) => {
        const speaker = m.role === "user" ? "You" : "Shop owner";
        return `**${speaker}:**\n\n${m.content}\n`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = title.replace(/[^a-z0-9-_ ]/gi, "").trim().slice(0, 60) || "chat";
    a.download = `record-shop-${safeTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, currentConversation]);

  const clearAllConversations = useCallback(() => {
    if (isLoading) stop();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear conversations:", e);
    }
    setConversations([]);
    setCurrentConversationId(null);
    currentConversationIdRef.current = null;
    isSwitchingRef.current = true;
    setChatKey(prev => prev + 1);
    setMessages([]);
    setInput("");
    setShowHistory(false);
    requestAnimationFrame(() => { isSwitchingRef.current = false; });
  }, [isLoading, stop, setMessages, setInput]);

  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  if (!isReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            The Record Shop
          </CardTitle>
          <CardDescription>
            Loading your collection before we can chat...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              The Record Shop
            </CardTitle>
            <CardDescription>
              Chat with a knowledgeable record shop owner about pressings, editions, and what to add to your collection.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={exportConversation}
                className="flex items-center gap-1"
                title="Download conversation as Markdown"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1"
            >
              <MessageSquare className="w-4 h-4" />
              History ({conversations.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={startNewConversation}
              className="flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex overflow-hidden gap-4">
        {/* Conversation History Sidebar */}
        {showHistory && conversations.length > 0 && (
          <div className="w-64 border-r pr-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Conversations</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllConversations}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {sortedConversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => loadConversation(conv)}
                      className={`p-2 rounded-md cursor-pointer text-sm flex items-center justify-between group hover:bg-muted ${
                        conv.id === currentConversationId ? "bg-muted" : ""
                      }`}
                    >
                      <span className="truncate flex-1">{conv.title}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => deleteConversation(conv.id, e)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
            <div className="space-y-4 pb-4">
              {messages.length === 0 && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="rounded-lg px-4 py-2 max-w-[80%] bg-muted">
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      {WELCOME_TEXT}
                    </div>
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Store className="w-4 h-4" />
                    )}
                  </div>
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {error && (
            <div className="flex items-start gap-2 mt-2 px-3 py-2 text-sm rounded-md border border-destructive/50 bg-destructive/10 text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">
                Something went wrong: {error.message || "request failed"}. Try again?
              </span>
            </div>
          )}

          {/* Streaming controls — stop the in-flight reply, or regenerate the last one */}
          {(isLoading || (messages.length > 0 && messages[messages.length - 1].role === "assistant")) && (
            <div className="flex justify-center mt-2">
              {isLoading ? (
                <Button variant="outline" size="sm" onClick={stop} className="flex items-center gap-1">
                  <Square className="w-3 h-3" />
                  Stop
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => reload()} className="flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" />
                  Regenerate
                </Button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about pressings, editions, recommendations... (Enter to send, Shift+Enter for new line)"
              className="flex-1 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[40px] max-h-[150px]"
              disabled={isLoading}
              rows={1}
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="self-end">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
