"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

type ThinkingMode = "brainstorm" | "deep-dive" | "critique";

const STORAGE_KEY = "brainstroming-ai-chats-v1";

const prompts = [
  {
    icon: "✦",
    label: "Create",
    text: "Brainstorm a memorable launch campaign for a sustainable fashion brand.",
  },
  {
    icon: "◎",
    label: "Explore",
    text: "Help me turn a rough app idea into a focused MVP and launch plan.",
  },
  {
    icon: "↗",
    label: "Improve",
    text: "Challenge my business idea and show me the three biggest blind spots.",
  },
  {
    icon: "◇",
    label: "Decide",
    text: "Give me a clear framework for choosing between two career opportunities.",
  },
];

const modes: { value: ThinkingMode; label: string; hint: string }[] = [
  { value: "brainstorm", label: "Brainstorm", hint: "Generate fresh directions" },
  { value: "deep-dive", label: "Deep dive", hint: "Analyze with more depth" },
  { value: "critique", label: "Critique", hint: "Stress-test an idea" },
];

function makeId() {
  return crypto.randomUUID();
}

function makeChat(): Chat {
  return {
    id: makeId(),
    title: "New conversation",
    messages: [],
    updatedAt: Date.now(),
  };
}

function createTitle(input: string) {
  const words = input.trim().replace(/\s+/g, " ").split(" ").slice(0, 7);
  return words.join(" ") + (input.trim().split(/\s+/).length > 7 ? "…" : "");
}

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function MenuIcon() {
  return (
    <span className="menu-icon" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ThinkingMode>("brainstorm");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as Chat[]) : [];
      const initial = parsed.length ? parsed : [makeChat()];
      setChats(initial);
      setActiveChatId(initial[0].id);
    } catch {
      const initial = makeChat();
      setChats([initial]);
      setActiveChatId(initial.id);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated && chats.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    }
  }, [chats, hydrated]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? chats[0],
    [chats, activeChatId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, loading]);

  function updateChat(chatId: string, update: (chat: Chat) => Chat) {
    setChats((current) =>
      current.map((chat) => (chat.id === chatId ? update(chat) : chat)),
    );
  }

  function newChat() {
    const chat = makeChat();
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput("");
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function deleteChat(chatId: string) {
    setChats((current) => {
      const remaining = current.filter((chat) => chat.id !== chatId);
      if (remaining.length) {
        if (chatId === activeChatId) setActiveChatId(remaining[0].id);
        return remaining;
      }
      const replacement = makeChat();
      setActiveChatId(replacement.id);
      return [replacement];
    });
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || loading || !activeChat) return;

    const chatId = activeChat.id;
    const firstMessage = activeChat.messages.length === 0;
    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const nextMessages = [...activeChat.messages, userMessage];

    updateChat(chatId, (chat) => ({
      ...chat,
      title: firstMessage ? createTitle(content) : chat.title,
      messages: nextMessages,
      updatedAt: Date.now(),
    }));
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          messages: nextMessages.map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        demo?: boolean;
        error?: string;
      };
      if (!response.ok || !data.text) {
        throw new Error(data.error || "Could not complete the response.");
      }

      setDemoMode(Boolean(data.demo));
      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content: data.text,
        createdAt: Date.now(),
      };
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, assistantMessage],
        updatedAt: Date.now(),
      }));
    } catch {
      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content:
          "I hit a connection problem. Please try again in a moment. If you are running the project locally, check that your OpenAI API key is configured.",
        createdAt: Date.now(),
      };
      updateChat(chatId, (chat) => ({
        ...chat,
        messages: [...chat.messages, assistantMessage],
        updatedAt: Date.now(),
      }));
    } finally {
      setLoading(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function choosePrompt(text: string) {
    setInput(text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  if (!hydrated || !activeChat) {
    return (
      <main className="app-loading">
        <Logo />
        <p>Preparing your thinking space…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div
        className={`sidebar-scrim ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#" aria-label="Brainstroming.ai home">
            <Logo />
            <span>Brainstroming<span className="brand-dot">.ai</span></span>
          </a>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <button className="new-chat-button" onClick={newChat}>
          <span aria-hidden="true">＋</span>
          New conversation
          <kbd>⌘ K</kbd>
        </button>

        <div className="history-label">
          <span>Recent</span>
          <span>{chats.length}</span>
        </div>

        <nav className="chat-history" aria-label="Conversation history">
          {chats
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((chat) => (
              <div
                className={`history-item ${chat.id === activeChat.id ? "active" : ""}`}
                key={chat.id}
              >
                <button
                  className="history-select"
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="history-bubble" aria-hidden="true">◌</span>
                  <span className="history-copy">
                    <strong>{chat.title}</strong>
                    <small>
                      {chat.messages.length
                        ? `${chat.messages.length} message${chat.messages.length === 1 ? "" : "s"}`
                        : "Ready when you are"}
                    </small>
                  </span>
                </button>
                <button
                  className="delete-chat"
                  onClick={() => deleteChat(chat.id)}
                  aria-label={`Delete ${chat.title}`}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))}
        </nav>

        <div className="sidebar-footer">
          <div className="usage-card">
            <span className="usage-icon">✦</span>
            <div>
              <strong>Make ideas happen</strong>
              <p>Your chats are saved on this device.</p>
            </div>
          </div>
          <button className="profile-button">
            <span className="avatar">B</span>
            <span>
              <strong>Guest workspace</strong>
              <small>Local preview</small>
            </span>
            <span className="profile-more">•••</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <MenuIcon />
          </button>
          <div className="mobile-brand">
            <Logo />
            <strong>Brainstroming.ai</strong>
          </div>
          <div className="mode-switcher">
            <span className="mode-spark">✦</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ThinkingMode)}
              aria-label="Thinking mode"
            >
              {modes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="mode-hint">
              {modes.find((item) => item.value === mode)?.hint}
            </span>
          </div>
          <div className="topbar-actions">
            {demoMode && <span className="demo-pill">Demo mode</span>}
            <button className="share-button" onClick={() => void navigator.clipboard.writeText(location.href)}>
              <span aria-hidden="true">↗</span>
              Share
            </button>
          </div>
        </header>

        <div className="conversation">
          {activeChat.messages.length === 0 ? (
            <section className="welcome">
              <div className="eyebrow"><span>✦</span> Your AI thinking partner</div>
              <h1>
                What will we<br />
                <em>think through</em> today?
              </h1>
              <p className="welcome-copy">
                Bring a spark, a messy problem, or a half-formed idea. We&apos;ll
                help you find the shape inside it.
              </p>
              <div className="prompt-grid">
                {prompts.map((prompt) => (
                  <button
                    className="prompt-card"
                    key={prompt.label}
                    onClick={() => choosePrompt(prompt.text)}
                  >
                    <span className="prompt-icon">{prompt.icon}</span>
                    <span>
                      <strong>{prompt.label}</strong>
                      <small>{prompt.text}</small>
                    </span>
                    <span className="prompt-arrow">↗</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="message-list" aria-live="polite">
              <div className="conversation-title">
                <span>{modes.find((item) => item.value === mode)?.label} session</span>
                <h1>{activeChat.title}</h1>
              </div>
              {activeChat.messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-avatar">
                    {message.role === "assistant" ? <Logo /> : "Y"}
                  </div>
                  <div className="message-body">
                    <div className="message-label">
                      {message.role === "assistant" ? "Brainstroming.ai" : "You"}
                    </div>
                    <div className="message-text">{message.content}</div>
                    {message.role === "assistant" && (
                      <button
                        className="copy-button"
                        onClick={() => void copyMessage(message)}
                      >
                        {copiedId === message.id ? "Copied" : "Copy response"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {loading && (
                <article className="message assistant">
                  <div className="message-avatar"><Logo /></div>
                  <div className="message-body">
                    <div className="message-label">Brainstroming.ai</div>
                    <div className="thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </article>
              )}
              <div ref={endRef} />
            </section>
          )}
        </div>

        <footer className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask anything, explore everything…"
              rows={1}
              aria-label="Message Brainstroming.ai"
            />
            <div className="composer-bottom">
              <div className="composer-tools">
                <button type="button" title="Attach a file" aria-label="Attach a file">＋</button>
                <span>Shift + Enter for a new line</span>
              </div>
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
          </form>
          <p className="disclaimer">
            Brainstroming.ai can make mistakes. Check important information.
          </p>
        </footer>
      </section>
    </main>
  );
}
