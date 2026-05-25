/**
 * AssistantChat — floating AI chat widget for paying subscribers only.
 * Renders a round amber button fixed to the bottom-right corner.
 * Clicking it opens a chat panel with the Craft Beer Brief AI assistant.
 * Messages are persisted to localStorage and sent to the brewery-assistant Edge Function.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../services/supabase'

// Suggested prompts shown in the empty-state greeting card
const SUGGESTED_PROMPTS = [
  'How do I log a gravity reading?',
  'What grants are available for my brewery?',
  'How do I set up packaging splits?',
  'What is the TTB excise tax rate?',
  'How do I schedule a brew day?',
  'Where do I find the compliance calendar?',
]

// Format a Date object as a short time string, e.g. "2:34 PM"
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function AssistantChat() {
  const { profile, brewery } = useAuth()

  // Only render for paying subscribers — not trial-only users
  const isPaidSubscriber =
    profile?.subscription_status === 'active' &&
    ['essentials', 'operations', 'full_suite'].includes(profile?.subscription_tier)

  if (!isPaidSubscriber) return null

  return <AssistantChatWidget profile={profile} brewery={brewery} />
}

/**
 * The actual widget — split into its own component so hooks only run when
 * the user is a paying subscriber (hooks can't be called conditionally).
 */
function AssistantChatWidget({ profile, brewery }) {
  const storageKey = `craftbrief_chat_${profile.id}`

  // Whether the chat panel is open
  const [isOpen, setIsOpen]   = useState(false)
  // Chat messages — each: { role, content, timestamp }
  const [messages, setMessages] = useState([])
  // Text the user is currently typing
  const [inputText, setInputText] = useState('')
  // True while waiting for the AI to respond
  const [isLoading, setIsLoading] = useState(false)
  // Remaining messages for today from the last API response
  const [remaining, setRemaining] = useState(null)
  // True for 3 seconds after first render to trigger the bounce animation
  const [showBounce, setShowBounce] = useState(true)

  const messagesEndRef  = useRef(null)
  const textareaRef     = useRef(null)

  // Load persisted messages from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        setMessages(JSON.parse(stored))
      }
    } catch {
      // Ignore parse errors — start fresh
    }
  }, [storageKey])

  // Stop the bounce animation after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowBounce(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Scroll to the bottom of the messages area whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-grow the textarea as the user types
  function handleInputChange(e) {
    setInputText(e.target.value)
    // Reset height first so it can shrink when text is deleted
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  // Save the full messages array to localStorage
  function persistMessages(msgs) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(msgs))
    } catch {
      // Ignore storage quota errors
    }
  }

  // Clear all messages from state and localStorage
  function clearConversation() {
    setMessages([])
    localStorage.removeItem(storageKey)
    setRemaining(null)
  }

  /**
   * Send a message to the brewery-assistant Edge Function.
   * Adds the user message to state immediately, shows a typing indicator,
   * then appends the assistant response (or an error bubble) when done.
   */
  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isLoading) return

    const userMsg = { role: 'user', content: content.trim(), timestamp: new Date().toISOString() }
    const updatedMessages = [...messages, userMsg]

    setMessages(updatedMessages)
    persistMessages(updatedMessages)
    setInputText('')
    setIsLoading(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Build the messages array for the API — strip timestamps, keep role+content only
      const apiMessages = updatedMessages.map(({ role, content }) => ({ role, content }))

      const { data, error } = await supabase.functions.invoke('brewery-assistant', {
        body: {
          messages:     apiMessages,
          brewery_name: brewery?.name ?? undefined,
        },
      })

      if (error) {
        // Supabase functions.invoke wraps HTTP errors — check for specific codes
        const errBody = error?.context?.body ? JSON.parse(error.context.body) : null
        const errCode = errBody?.error

        let errorText = 'Something went wrong. Please try again.'
        if (errCode === 'subscriber_only') {
          errorText = 'The AI assistant is available to paid subscribers. Upgrade now →'
        } else if (errCode === 'rate_limit') {
          const limit = errBody?.limit ?? '?'
          errorText = `You've reached today's limit of ${limit} messages. Resets at midnight! 🌙`
        }

        const errorMsg = {
          role:      'system-error',
          content:   errorText,
          timestamp: new Date().toISOString(),
        }
        const withError = [...updatedMessages, errorMsg]
        setMessages(withError)
        persistMessages(withError)
        return
      }

      const assistantMsg = {
        role:      'assistant',
        content:   data.response,
        timestamp: new Date().toISOString(),
      }
      const withAssistant = [...updatedMessages, assistantMsg]
      setMessages(withAssistant)
      persistMessages(withAssistant)

      if (typeof data.remaining === 'number') {
        setRemaining(data.remaining)
      }

    } catch (err) {
      const errorMsg = {
        role:      'system-error',
        content:   'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }
      const withError = [...updatedMessages, errorMsg]
      setMessages(withError)
      persistMessages(withError)
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, brewery?.name, storageKey])

  // Enter sends the message; Shift+Enter inserts a newline
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputText)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* CSS keyframes for bounce + typing dot animations */}
      <style>{`
        @keyframes assistantBounce {
          0%, 100% { transform: translateY(0); }
          40%       { transform: translateY(-10px); }
          60%       { transform: translateY(-5px); }
        }
        @keyframes assistantSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes assistantDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
        .assistant-bounce {
          animation: assistantBounce 0.8s ease 0.4s 3;
        }
        .assistant-panel {
          animation: assistantSlideUp 0.3s ease forwards;
        }
        .assistant-dot:nth-child(1) { animation: assistantDot 1.2s ease-in-out infinite 0s; }
        .assistant-dot:nth-child(2) { animation: assistantDot 1.2s ease-in-out infinite 0.2s; }
        .assistant-dot:nth-child(3) { animation: assistantDot 1.2s ease-in-out infinite 0.4s; }
      `}</style>

      {/* ── Floating trigger button ── */}
      <div
        style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 50 }}
        className="flex flex-col items-center gap-1"
      >
        {/* Chat panel — renders above the button when open */}
        {isOpen && (
          <div
            className="assistant-panel"
            style={{
              position:     'absolute',
              bottom:       '68px',
              right:        0,
              width:        'min(380px, calc(100vw - 32px))',
              height:       'min(520px, calc(100dvh - 80px))',
              background:   '#fff',
              border:       '1px solid #E5E7EB',
              borderRadius: '12px',
              boxShadow:    '0 20px 60px rgba(0,0,0,0.15)',
              display:      'flex',
              flexDirection:'column',
              overflow:     'hidden',
            }}
            role="dialog"
            aria-label="Craft Beer Brief AI Assistant"
          >
            {/* Panel header */}
            <div
              style={{
                background: '#C8871A',
                padding:    '12px 16px',
                display:    'flex',
                alignItems: 'center',
                gap:        '8px',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: '18px' }} aria-hidden="true">✨</span>
              <span style={{ color: '#fff', fontWeight: '700', fontSize: '15px', flex: 1 }}>
                Craft Brief AI
              </span>

              {/* Clear conversation button */}
              <button
                onClick={clearConversation}
                style={{
                  color:      '#fff',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    '4px',
                  opacity:    1,
                  fontSize:   '16px',
                  lineHeight: 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                aria-label="Clear conversation"
                title="Clear conversation"
              >
                🗑️
              </button>

              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  color:      '#fff',
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    '4px',
                  opacity:    1,
                  fontSize:   '18px',
                  fontWeight: '700',
                  lineHeight: 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>

            {/* Messages area */}
            <div
              style={{
                flex:       1,
                overflowY:  'auto',
                padding:    '16px',
                background: '#fff',
                display:    'flex',
                flexDirection: 'column',
              }}
            >
              {messages.length === 0 ? (
                /* Empty state — greeting + suggested prompt chips */
                <div>
                  <p style={{ color: '#1A2744', fontWeight: '600', fontSize: '14px', marginBottom: '6px' }}>
                    ✨ Hi! I'm your Craft Beer Brief assistant.
                  </p>
                  <p style={{ color: '#6B7280', fontSize: '13px', marginBottom: '14px' }}>
                    Ask me anything about the app, TTB compliance, grants, or your brewing workflow.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        style={{
                          background:   '#FFF7ED',
                          border:       '1px solid #C8871A',
                          borderRadius: '20px',
                          color:        '#C8871A',
                          fontSize:     '12px',
                          fontWeight:   '500',
                          padding:      '6px 12px',
                          cursor:       'pointer',
                          transition:   'background 0.15s',
                          textAlign:    'left',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FDEBD0'}
                        onMouseLeave={e => e.currentTarget.style.background = '#FFF7ED'}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Message bubbles */
                messages.map((msg, idx) => {
                  const isUser   = msg.role === 'user'
                  const isError  = msg.role === 'system-error'
                  const isAssist = msg.role === 'assistant'

                  return (
                    <div
                      key={idx}
                      style={{
                        display:       'flex',
                        flexDirection: 'column',
                        alignItems:    isUser ? 'flex-end' : 'flex-start',
                        marginBottom:  '8px',
                      }}
                    >
                      <div
                        style={{
                          maxWidth:     isUser ? '75%' : '80%',
                          background:   isUser ? '#C8871A' : isError ? '#FEF3C7' : '#fff',
                          color:        isUser ? '#fff' : '#1A2744',
                          border:       isUser ? 'none' : isError ? '1px solid #C8871A' : '1px solid #E5E7EB',
                          borderRadius: isUser
                            ? '12px 12px 2px 12px'
                            : '12px 12px 12px 2px',
                          padding:      '10px 14px',
                          fontSize:     '13px',
                          lineHeight:   '1.55',
                          whiteSpace:   'pre-wrap',
                          wordBreak:    'break-word',
                        }}
                      >
                        {msg.content}
                      </div>
                      {/* Timestamp */}
                      <span style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '3px' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  )
                })
              )}

              {/* Typing indicator — three animated dots */}
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div
                    style={{
                      background:   '#fff',
                      border:       '1px solid #E5E7EB',
                      borderRadius: '12px 12px 12px 2px',
                      padding:      '12px 16px',
                      display:      'flex',
                      gap:          '5px',
                      alignItems:   'center',
                    }}
                    aria-label="Assistant is typing"
                  >
                    <span className="assistant-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C8871A', display: 'inline-block' }} />
                    <span className="assistant-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C8871A', display: 'inline-block' }} />
                    <span className="assistant-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C8871A', display: 'inline-block' }} />
                  </div>
                </div>
              )}

              {/* Invisible anchor for auto-scroll */}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer — usage counter + input row */}
            <div
              style={{
                borderTop:  '1px solid #E5E7EB',
                padding:    '10px 12px',
                background: '#FAFAFA',
                flexShrink: 0,
              }}
            >
              {/* Daily usage counter */}
              {remaining !== null && (
                <p style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '8px' }}>
                  {remaining} message{remaining !== 1 ? 's' : ''} remaining today
                </p>
              )}

              {/* Input row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your brewery…"
                  rows={1}
                  disabled={isLoading}
                  style={{
                    flex:         1,
                    border:       '1px solid #D1D5DB',
                    borderRadius: '8px',
                    padding:      '10px 12px',
                    fontSize:     '13px',
                    resize:       'none',
                    maxHeight:    '100px',
                    lineHeight:   '1.4',
                    outline:      'none',
                    background:   isLoading ? '#F9FAFB' : '#fff',
                    color:        '#1A2744',
                    overflowY:    'auto',
                  }}
                  aria-label="Message input"
                />

                {/* Send button */}
                <button
                  onClick={() => sendMessage(inputText)}
                  disabled={isLoading || !inputText.trim()}
                  style={{
                    background:   (isLoading || !inputText.trim()) ? '#E5E7EB' : '#C8871A',
                    border:       'none',
                    borderRadius: '8px',
                    width:        '40px',
                    height:       '40px',
                    cursor:       (isLoading || !inputText.trim()) ? 'not-allowed' : 'pointer',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     '16px',
                    flexShrink:   0,
                    transition:   'background 0.15s',
                  }}
                  aria-label="Send message"
                >
                  {/* Paper plane icon via SVG */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Round trigger button */}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={showBounce && !isOpen ? 'assistant-bounce' : ''}
          style={{
            width:         '56px',
            height:        '56px',
            borderRadius:  '50%',
            background:    '#C8871A',
            border:        'none',
            cursor:        'pointer',
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            fontSize:      '24px',
            boxShadow:     '0 4px 16px rgba(200,135,26,0.4)',
            transition:    'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform  = 'scale(1.08)'
            e.currentTarget.style.boxShadow  = '0 6px 20px rgba(200,135,26,0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform  = 'scale(1)'
            e.currentTarget.style.boxShadow  = '0 4px 16px rgba(200,135,26,0.4)'
          }}
          aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            // X icon when open
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            '✨'
          )}
        </button>

        {/* "AI Assistant" label below button */}
        {!isOpen && (
          <span style={{ fontSize: '10px', color: '#6B7280', fontWeight: '500', whiteSpace: 'nowrap' }}>
            AI Assistant
          </span>
        )}
      </div>
    </>
  )
}
