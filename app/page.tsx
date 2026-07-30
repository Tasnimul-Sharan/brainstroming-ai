"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ThinkingMode = "brainstorm" | "deep-dive" | "critique";
type Usage = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  dailyLimit: number;
};
type Session = {
  user: { email: string; displayName: string; isLocal: boolean };
  usage: Usage;
  apiConfigured: boolean;
  signOutPath: string;
};
type Conversation = {
  id: string;
  title: string;
  mode: ThinkingMode;
  shareToken: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};
type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedback?: "up" | "down" | null;
  createdAt: number;
  editedAt?: number | null;
  attachments?: Attachment[];
  pending?: boolean;
};

const modes: Array<{ value: ThinkingMode; label: string; hint: string }> = [
  { value: "brainstorm", label: "Brainstorm", hint: "Generate fresh directions" },
  { value: "deep-dive", label: "Deep dive", hint: "Analyze with more depth" },
  { value: "critique", label: "Critique", hint: "Stress-test an idea" },
];

const prompts = [
  {
    icon: "+",
    label: "Create",
    text: "Brainstorm a memorable launch campaign for a sustainable fashion brand.",
  },
  {
    icon: "O",
    label: "Explore",
    text: "Help me turn a rough app idea into a focused MVP and launch plan.",
  },
  {
    icon: "^",
    label: "Improve",
    text: "Challenge my business idea and show me the three biggest blind spots.",
  },
  {
    icon: "<>",
    label: "Decide",
    text: "Give me a clear framework for choosing between two career opportunities.",
  },
];

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

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [signInPath, setSignInPath] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ThinkingMode>("brainstorm");
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const loadConversations = useCallback(async (query = "") => {
    const data = await jsonResponse<{ conversations: Conversation[] }>(
      await fetch(`/api/conversations${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    );
    setConversations(data.conversations);
    return data.conversations;
  }, []);

  const createConversation = useCallback(async () => {
    const data = await jsonResponse<{ conversation: Conversation }>(
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "brainstorm" }),
      }),
    );
    setConversations((current) => [data.conversation, ...current]);
    setActiveConversation(data.conversation);
    setMessages([]);
    setAttachments([]);
    setMode(data.conversation.mode);
    return data.conversation;
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const data = await jsonResponse<{
      conversation: Conversation;
      messages: Message[];
      attachments: Attachment[];
    }>(await fetch(`/api/conversations/${id}`));
    setActiveConversation(data.conversation);
    setMessages(data.messages);
    setMode(data.conversation.mode);
    setAttachments([]);
    return data;
  }, []);

  const refreshSession = useCallback(async () => {
    const response = await fetch("/api/session");
    if (response.status === 401) {
      const data = (await response.json()) as { signInPath: string };
      setSignInPath(data.signInPath);
      setReady(true);
      return null;
    }
    const data = await jsonResponse<Session>(response);
    setSession(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const currentSession = await refreshSession();
        if (!currentSession || cancelled) return;
        const list = await loadConversations();
        if (cancelled) return;
        if (list.length) {
          await loadConversation(list[0].id);
        } else {
          await createConversation();
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load your workspace.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [createConversation, loadConversation, loadConversations, refreshSession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => {
      void loadConversations(search).catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Search failed."),
      );
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadConversations, search, session]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  async function selectConversation(id: string) {
    if (streaming) abortRef.current?.abort();
    setError("");
    await loadConversation(id);
    setSidebarOpen(false);
  }

  async function newConversation() {
    if (streaming) abortRef.current?.abort();
    setInput("");
    setError("");
    await createConversation();
    setSidebarOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Delete this conversation permanently?")) return;
    await jsonResponse<unknown>(
      await fetch(`/api/conversations/${id}`, { method: "DELETE" }),
    ).catch((cause) => {
      if (cause instanceof SyntaxError) return {};
      throw cause;
    });
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    setConversations(remaining);
    if (activeConversation?.id === id) {
      if (remaining.length) await loadConversation(remaining[0].id);
      else await createConversation();
    }
    showToast("Conversation deleted");
  }

  async function updateMode(nextMode: ThinkingMode) {
    setMode(nextMode);
    if (!activeConversation) return;
    const data = await jsonResponse<{ conversation: Conversation }>(
      await fetch(`/api/conversations/${activeConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      }),
    );
    setActiveConversation(data.conversation);
  }

  function updateMessage(id: string, update: Partial<Message>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, ...update } : message,
      ),
    );
  }

  async function streamResponse(
    body: Record<string, unknown>,
    optimisticMessages: Message[],
  ) {
    if (!activeConversation || streaming) return;
    const assistantTempId = `pending-${crypto.randomUUID()}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError("");
    setMessages([
      ...optimisticMessages,
      {
        id: assistantTempId,
        role: "assistant",
        content: "",
        createdAt: 0,
        pending: true,
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversation.id,
          mode,
          ...body,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "Could not start the response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let persistedId = assistantTempId;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: "delta" | "done" | "error";
            delta?: string;
            messageId?: string;
            error?: string;
          };
          if (event.type === "delta" && event.delta) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantTempId
                  ? { ...message, content: message.content + event.delta }
                  : message,
              ),
            );
          } else if (event.type === "done") {
            persistedId = event.messageId || persistedId;
          } else if (event.type === "error") {
            throw new Error(event.error || "The response was interrupted.");
          }
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantTempId
            ? { ...message, id: persistedId, pending: false }
            : message,
        ),
      );
      setAttachments([]);
      await Promise.all([
        loadConversations(search),
        refreshSession(),
      ]);
    } catch (cause) {
      if (controller.signal.aborted) {
        showToast("Response stopped");
      } else {
        setError(cause instanceof Error ? cause.message : "The response failed.");
      }
      await loadConversation(activeConversation.id).catch(() => undefined);
    } finally {
      abortRef.current = null;
      setStreaming(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || !activeConversation || streaming) return;
    const optimistic: Message = {
      id: `pending-${crypto.randomUUID()}`,
      role: "user",
      content,
      attachments,
      createdAt: 0,
      pending: true,
    };
    setInput("");
    await streamResponse(
      { content, attachmentIds: attachments.map((attachment) => attachment.id) },
      [...messages, optimistic],
    );
  }

  async function regenerate(message: Message) {
    const index = messages.findIndex((item) => item.id === message.id);
    if (index < 0 || streaming) return;
    await streamResponse(
      { regenerateMessageId: message.id },
      messages.slice(0, index),
    );
  }

  async function saveEdit(message: Message) {
    const content = editText.trim();
    if (!content || streaming) return;
    await jsonResponse(
      await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    );
    setEditingId("");
    const index = messages.findIndex((item) => item.id === message.id);
    const baseline = messages
      .slice(0, index + 1)
      .map((item) => (item.id === message.id ? { ...item, content } : item));
    await streamResponse({ continueFromLatest: true }, baseline);
  }

  async function setFeedback(message: Message, feedback: "up" | "down") {
    const next = message.feedback === feedback ? null : feedback;
    await jsonResponse(
      await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: next }),
      }),
    );
    updateMessage(message.id, { feedback: next });
    showToast(next ? "Thanks for the feedback" : "Feedback removed");
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function shareConversation() {
    if (!activeConversation) return;
    const data = await jsonResponse<{
      conversation: Conversation;
      shareUrl: string;
    }>(
      await fetch(`/api/conversations/${activeConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharing: true }),
      }),
    );
    setActiveConversation(data.conversation);
    await navigator.clipboard.writeText(data.shareUrl);
    showToast("Public conversation link copied");
  }

  async function uploadFile(file: File) {
    if (!activeConversation || attachments.length >= 3) {
      setError("You can attach up to 3 files to a message.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("conversationId", activeConversation.id);
      form.set("file", file);
      const data = await jsonResponse<{ attachment: Attachment }>(
        await fetch("/api/attachments", { method: "POST", body: form }),
      );
      setAttachments((current) => [...current, data.attachment]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(attachment: Attachment) {
    await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
    setAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
  }

  async function exportAccount() {
    const response = await fetch("/api/account");
    if (!response.ok) {
      setError("Could not export your data.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brainstroming-ai-export.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Account data exported");
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account, conversations, messages, and files permanently?",
      )
    ) {
      return;
    }
    await jsonResponse(
      await fetch("/api/account", { method: "DELETE" }),
    ).catch((cause) => {
      if (cause instanceof SyntaxError) return {};
      throw cause;
    });
    location.assign(session?.signOutPath || "/");
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  if (!ready) {
    return (
      <main className="app-loading">
        <Logo />
        <p>Preparing your thinking space...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <Logo />
          <span className="eyebrow">Your AI thinking partner</span>
          <h1>Think better, together.</h1>
          <p>
            Sign in to securely sync conversations, files, and usage across your
            devices.
          </p>
          <a className="auth-button" href={signInPath || "/signin-with-chatgpt?return_to=%2F"}>
            Sign in with ChatGPT
          </a>
          {error && <div className="inline-alert">{error}</div>}
        </div>
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
          <button className="brand brand-button" onClick={() => void newConversation()}>
            <Logo />
            <span>
              Brainstroming<span className="brand-dot">.ai</span>
            </span>
          </button>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            x
          </button>
        </div>

        <button className="new-chat-button" onClick={() => void newConversation()}>
          <span aria-hidden="true">+</span>
          New conversation
          <kbd>Ctrl K</kbd>
        </button>

        <label className="history-search">
          <span aria-hidden="true">Q</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </label>

        <div className="history-label">
          <span>{search ? "Results" : "Recent"}</span>
          <span>{conversations.length}</span>
        </div>

        <nav className="chat-history" aria-label="Conversation history">
          {conversations.map((conversation) => (
            <div
              className={`history-item ${
                conversation.id === activeConversation?.id ? "active" : ""
              }`}
              key={conversation.id}
            >
              <button
                className="history-select"
                onClick={() => void selectConversation(conversation.id)}
              >
                <span className="history-bubble" aria-hidden="true">
                  O
                </span>
                <span className="history-copy">
                  <strong>{conversation.title}</strong>
                  <small>
                    {conversation.messageCount
                      ? `${conversation.messageCount} messages`
                      : "Ready when you are"}
                  </small>
                </span>
              </button>
              <button
                className="delete-chat"
                onClick={() => void deleteConversation(conversation.id)}
                aria-label={`Delete ${conversation.title}`}
              >
                x
              </button>
            </div>
          ))}
          {!conversations.length && (
            <p className="empty-history">No conversations found.</p>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="usage-card">
            <span className="usage-icon">+</span>
            <div className="usage-copy">
              <strong>
                {session.usage.requestCount} / {session.usage.dailyLimit} today
              </strong>
              <div className="usage-track">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      (session.usage.requestCount / session.usage.dailyLimit) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p>{session.usage.inputTokens + session.usage.outputTokens} tokens used</p>
            </div>
          </div>
          <button
            className="profile-button"
            onClick={() => setProfileOpen(true)}
          >
            <span className="avatar">
              {session.user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.user.displayName}</strong>
              <small>{session.user.isLocal ? "Local preview" : session.user.email}</small>
            </span>
            <span className="profile-more">...</span>
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
            <span className="mode-spark">+</span>
            <select
              value={mode}
              onChange={(event) =>
                void updateMode(event.target.value as ThinkingMode)
              }
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
            {!session.apiConfigured && (
              <span className="setup-pill">API setup needed</span>
            )}
            <button className="share-button" onClick={() => void shareConversation()}>
              <span aria-hidden="true">^</span>
              Share
            </button>
            <button
              className="top-avatar"
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile"
            >
              {session.user.displayName.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="conversation">
          {!session.apiConfigured && (
            <div className="setup-banner">
              <strong>Connect OpenAI to start generating.</strong>
              <span>
                Add <code>OPENAI_API_KEY</code> to the secure environment, then
                restart the app.
              </span>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}

          {!messages.length ? (
            <section className="welcome">
              <div className="eyebrow">
                <span>+</span> Your AI thinking partner
              </div>
              <h1>
                What will we
                <br />
                <em>think through</em> today?
              </h1>
              <p className="welcome-copy">
                Bring a spark, a messy problem, or a half-formed idea. We will
                help you find the shape inside it.
              </p>
              <div className="prompt-grid">
                {prompts.map((prompt) => (
                  <button
                    className="prompt-card"
                    key={prompt.label}
                    onClick={() => {
                      setInput(prompt.text);
                      requestAnimationFrame(() => textareaRef.current?.focus());
                    }}
                  >
                    <span className="prompt-icon">{prompt.icon}</span>
                    <span>
                      <strong>{prompt.label}</strong>
                      <small>{prompt.text}</small>
                    </span>
                    <span className="prompt-arrow">^</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="message-list" aria-live="polite">
              <div className="conversation-title">
                <span>{modes.find((item) => item.value === mode)?.label} session</span>
                <h1>{activeConversation?.title}</h1>
              </div>
              {messages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="message-avatar">
                    {message.role === "assistant" ? <Logo /> : "Y"}
                  </div>
                  <div className="message-body">
                    <div className="message-label">
                      {message.role === "assistant" ? "Brainstroming.ai" : "You"}
                      {message.editedAt ? " - edited" : ""}
                    </div>
                    {editingId === message.id ? (
                      <div className="edit-box">
                        <textarea
                          value={editText}
                          onChange={(event) => setEditText(event.target.value)}
                          rows={4}
                          autoFocus
                        />
                        <div>
                          <button onClick={() => setEditingId("")}>Cancel</button>
                          <button onClick={() => void saveEdit(message)}>
                            Save and resend
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="message-text">
                        {message.content ||
                          (message.pending ? (
                            <span className="thinking">
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : null)}
                      </div>
                    )}
                    {!!message.attachments?.length && (
                      <div className="message-files">
                        {message.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={`/api/attachments/${attachment.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {attachment.filename}
                            <small>{formatBytes(attachment.size)}</small>
                          </a>
                        ))}
                      </div>
                    )}
                    {!message.pending && editingId !== message.id && (
                      <div className="message-actions">
                        {message.role === "user" ? (
                          <button
                            onClick={() => {
                              setEditingId(message.id);
                              setEditText(message.content);
                            }}
                          >
                            Edit and resend
                          </button>
                        ) : (
                          <>
                            <button onClick={() => void copyMessage(message)}>
                              {copiedId === message.id ? "Copied" : "Copy"}
                            </button>
                            <button onClick={() => void regenerate(message)}>
                              Regenerate
                            </button>
                            <button
                              className={message.feedback === "up" ? "selected" : ""}
                              onClick={() => void setFeedback(message, "up")}
                              aria-label="Helpful response"
                            >
                              Helpful
                            </button>
                            <button
                              className={message.feedback === "down" ? "selected" : ""}
                              onClick={() => void setFeedback(message, "down")}
                              aria-label="Unhelpful response"
                            >
                              Not helpful
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </section>
          )}
        </div>

        <footer className="composer-wrap">
          {!!attachments.length && (
            <div className="attachment-tray">
              {attachments.map((attachment) => (
                <div className="attachment-chip" key={attachment.id}>
                  <span>
                    <strong>{attachment.filename}</strong>
                    <small>{formatBytes(attachment.size)}</small>
                  </span>
                  <button
                    onClick={() => void removeAttachment(attachment)}
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 12000))}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask anything, explore everything..."
              rows={1}
              aria-label="Message Brainstroming.ai"
              disabled={streaming}
            />
            <div className="composer-bottom">
              <div className="composer-tools">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || attachments.length >= 3 || streaming}
                  aria-label="Attach a file"
                >
                  {uploading ? "..." : "+"}
                </button>
                <span>
                  {input.length.toLocaleString()} / 12,000 - Shift + Enter for a
                  new line
                </span>
              </div>
              {streaming ? (
                <button
                  className="stop-button"
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop generating"
                >
                  <span />
                </button>
              ) : (
                <button
                  className="send-button"
                  type="submit"
                  disabled={!input.trim() || uploading || !session.apiConfigured}
                  aria-label="Send message"
                >
                  ^
                </button>
              )}
            </div>
          </form>
          <p className="disclaimer">
            Brainstroming.ai can make mistakes. Check important information.
          </p>
        </footer>
      </section>

      {profileOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProfileOpen(false)}>
          <section
            className="profile-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Profile and account"
          >
            <button
              className="modal-close"
              onClick={() => setProfileOpen(false)}
              aria-label="Close profile"
            >
              x
            </button>
            <div className="profile-heading">
              <span className="avatar">
                {session.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{session.user.displayName}</h2>
                <p>{session.user.email}</p>
              </div>
            </div>
            <div className="profile-stat-grid">
              <div>
                <strong>{session.usage.requestCount}</strong>
                <span>Requests today</span>
              </div>
              <div>
                <strong>
                  {(session.usage.inputTokens + session.usage.outputTokens).toLocaleString()}
                </strong>
                <span>Tokens today</span>
              </div>
              <div>
                <strong>
                  ${(session.usage.estimatedCostMicros / 1_000_000).toFixed(4)}
                </strong>
                <span>Estimated cost</span>
              </div>
            </div>
            <div className="account-actions">
              <button onClick={() => void exportAccount()}>Export my data</button>
              {!session.user.isLocal && (
                <a href={session.signOutPath}>Log out</a>
              )}
              <button className="danger" onClick={() => void deleteAccount()}>
                Delete account and data
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
