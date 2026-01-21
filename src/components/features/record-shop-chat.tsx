"use client";

import { useChat, type Message } from "ai/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Store, Send, Loader2, User, Plus, MessageSquare, Trash2 } from "lucide-react";
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

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hey there! Welcome to the shop. I've had a look at your collection - you've got some great stuff in there. What can I help you with today? Looking for pressing advice, hunting for something specific, or just want to chat records?",
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load conversations from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedConversation[];
        setConversations(parsed);
        // Load most recent conversation if exists
        if (parsed.length > 0) {
          const mostRecent = parsed.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          setCurrentConversationId(mostRecent.id);
        }
      } catch (e) {
        console.error("Failed to parse saved conversations:", e);
      }
    }
  }, []);

  // Track a key to force useChat to reset
  const [chatKey, setChatKey] = useState(0);

  // Get current conversation's messages for initialMessages
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const initialMessages = currentConversation?.messages || [WELCOME_MESSAGE];

  const { messages, input, setInput, handleSubmit, isLoading, setMessages } = useChat({
    api: "/api/chat",
    body: {
      collection: collectionString,
      wantlist: wantlistString,
    },
    initialMessages,
    id: currentConversationId || `new-${chatKey}`,
  });

  // Save conversation whenever messages change
  const saveConversation = useCallback((msgs: Message[]) => {
    if (msgs.length <= 1) return; // Don't save if only welcome message

    setConversations(prev => {
      let updated: SavedConversation[];

      if (currentConversationId) {
        // Update existing conversation
        updated = prev.map(c =>
          c.id === currentConversationId
            ? { ...c, messages: msgs, title: getConversationTitle(msgs), updatedAt: Date.now() }
            : c
        );
      } else {
        // Create new conversation
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
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, [currentConversationId]);

  // Save when messages change (but not on initial load)
  useEffect(() => {
    if (messages.length > 1) {
      saveConversation(messages);
    }
  }, [messages, saveConversation]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const startNewConversation = () => {
    setCurrentConversationId(null);
    setChatKey(prev => prev + 1);
    setMessages([WELCOME_MESSAGE]);
  };

  const loadConversation = (conv: SavedConversation) => {
    setCurrentConversationId(conv.id);
    setMessages(conv.messages);
    setShowHistory(false);
  };

  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    if (currentConversationId === id) {
      startNewConversation();
    }
  };

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
            <h4 className="text-sm font-medium mb-2">Conversations</h4>
            <ScrollArea className="flex-1">
              <div className="space-y-1">
                {conversations
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map(conv => (
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
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4 pb-4">
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
