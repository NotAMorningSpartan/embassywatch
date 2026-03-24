import { useState, useRef, useEffect, useCallback } from "react";
import { useAIPanelStore } from "../stores/useAIPanelStore";
import type { QAPair, PageContext } from "../stores/useAIPanelStore";
import api from "../services/api";

/* ---- Suggestion chips based on page context ---- */

function getSuggestions(ctx: PageContext): string[] {
  if (ctx.type === "embassy-detail" && ctx.embassyName) {
    return [
      `Summarize the threat to ${ctx.embassyName}`,
      "What events are driving this threat level?",
      "What are the recommendations for this embassy?",
      "How has the threat level changed recently?",
    ];
  }
  if (ctx.type === "watchlist") {
    return [
      "Which of my watched embassies has the highest threat?",
      "Summarize recent changes in my watchlist",
      "Are any of my watched embassies improving?",
    ];
  }
  return [
    "Which embassies have the highest threat levels right now?",
    "Summarize the situation in the Near East region",
    "What changed in the last 24 hours?",
    "Compare Embassy Nairobi and Embassy Dar es Salaam",
  ];
}

/* ---- Simple Markdown Renderer ---- */

function renderMarkdown(text: string): string {
  let html = text
    // Headers
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Paragraphs (double newlines)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines within paragraphs
    .replace(/\n/g, "<br />");

  // Wrap <li> groups in <ul>
  html = html.replace(
    /(<li>[\s\S]*?<\/li>)/g,
    (match) => `<ul>${match}</ul>`,
  );
  // Remove nested <ul> from duplicate wrapping
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  return `<p>${html}</p>`;
}

/* ---- Component ---- */

export default function AIPanel() {
  const {
    isOpen,
    isLoading,
    history,
    recentQueries,
    pageContext,
    closePanel,
    setLoading,
    addQAPair,
    clearHistory,
    addRecentQuery,
    clearPageContext,
  } = useAIPanelStore();

  const [input, setInput] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest response
  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history.length, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closePanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closePanel]);

  const handleSubmit = useCallback(
    async (question?: string) => {
      const q = (question ?? input).trim();
      if (!q || isLoading) return;

      setInput("");
      setShowRecent(false);
      setLoading(true);
      addRecentQuery(q);

      try {
        const response = await api.post("/api/ai/query", {
          question: q,
          pageContext: {
            type: pageContext.type,
            embassyId: pageContext.embassyId,
            watchlistIds: pageContext.watchlistIds,
          },
        });

        const pair: QAPair = {
          id: `qa-${Date.now()}`,
          question: q,
          answer: response.data.answer,
          model: response.data.model,
          tokensUsed: response.data.tokensUsed,
          processingTimeMs: response.data.processingTimeMs,
          timestamp: Date.now(),
        };
        addQAPair(pair);
      } catch (err: unknown) {
        const errMsg =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ??
          "Failed to get a response. Please try again.";
        const pair: QAPair = {
          id: `qa-${Date.now()}`,
          question: q,
          answer: `**Error:** ${errMsg}`,
          model: "error",
          tokensUsed: 0,
          processingTimeMs: 0,
          timestamp: Date.now(),
        };
        addQAPair(pair);
      } finally {
        setLoading(false);
      }
    },
    [input, isLoading, pageContext, setLoading, addQAPair, addRecentQuery],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const copyAnswer = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const suggestions = getSuggestions(pageContext);
  const contextLabel =
    pageContext.type === "embassy-detail" && pageContext.embassyName
      ? `Context: ${pageContext.embassyName}`
      : pageContext.type === "watchlist"
        ? "Context: Your Watchlist"
        : null;

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="ew-ai-backdrop" onClick={closePanel} />

      <div className="ew-ai-panel">
        {/* Header */}
        <div className="ew-ai-panel__header">
          <div className="ew-ai-panel__title">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L9 8.5 2 9.5l5 5-1 7 6-3.5 6 3.5-1-7 5-5-7-1z" />
            </svg>
            EmbassyWatch AI
          </div>
          <button className="ew-ai-panel__close" onClick={closePanel}>
            &times;
          </button>
        </div>

        {/* Conversation history */}
        <div className="ew-ai-panel__history">
          {history.length === 0 && !isLoading && (
            <div className="ew-ai-panel__empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ew-gray)"
                strokeWidth="1.5"
              >
                <path d="M12 2L9 8.5 2 9.5l5 5-1 7 6-3.5 6 3.5-1-7 5-5-7-1z" />
              </svg>
              <p>Ask a question about embassy security data</p>
            </div>
          )}

          {history.length > 0 && (
            <button
              className="ew-ai-panel__clear-history"
              onClick={clearHistory}
            >
              Clear History
            </button>
          )}

          {history.map((pair) => (
            <div key={pair.id} className="ew-ai-panel__qa">
              <div className="ew-ai-panel__question">
                <span className="ew-ai-panel__q-label">You</span>
                {pair.question}
              </div>
              <div className="ew-ai-panel__answer">
                <div
                  className="ew-ai-panel__answer-content"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(pair.answer),
                  }}
                />
                <div className="ew-ai-panel__answer-meta">
                  <span className="ew-ai-panel__ai-label">AI-generated</span>
                  <span>
                    {new Date(pair.timestamp).toLocaleTimeString()}
                  </span>
                  {pair.model !== "error" && (
                    <span>
                      {pair.model} · {pair.processingTimeMs}ms
                    </span>
                  )}
                </div>
                <div className="ew-ai-panel__answer-actions">
                  <button
                    className="ew-ai-panel__action-btn"
                    onClick={() => copyAnswer(pair.answer)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="ew-ai-panel__qa">
              <div className="ew-ai-panel__answer">
                <div className="ew-ai-panel__loading">
                  <span className="ew-ai-dot" />
                  <span className="ew-ai-dot" />
                  <span className="ew-ai-dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={historyEndRef} />
        </div>

        {/* Context badge */}
        {contextLabel && (
          <div className="ew-ai-panel__context">
            <span>{contextLabel}</span>
            <button onClick={clearPageContext}>&times;</button>
          </div>
        )}

        {/* Suggestion chips */}
        {input === "" && history.length === 0 && !isLoading && (
          <div className="ew-ai-panel__suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                className="ew-ai-panel__chip"
                onClick={() => handleSubmit(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="ew-ai-panel__input-area">
          <div className="ew-ai-panel__input-wrap">
            {/* Recent queries dropdown */}
            {showRecent && recentQueries.length > 0 && (
              <div className="ew-ai-panel__recent">
                {recentQueries.map((q, i) => (
                  <button
                    key={i}
                    className="ew-ai-panel__recent-item"
                    onClick={() => {
                      setShowRecent(false);
                      handleSubmit(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              className="ew-ai-panel__textarea"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowRecent(true)}
              onBlur={() => setTimeout(() => setShowRecent(false), 200)}
              disabled={isLoading}
              rows={2}
            />
            <button
              className="ew-ai-panel__send"
              onClick={() => handleSubmit()}
              disabled={!input.trim() || isLoading}
              title="Send"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
