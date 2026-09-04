'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { DEFAULT_LANGUAGE, findLanguage, LANGUAGES, type LanguageCode } from '@/lib/languages'

export type ComposerAttachment = {
  name: string
  kind: 'image' | 'video' | 'pdf' | 'text'
  data?: string
}

export type ComposerRecordingState = 'idle' | 'recording' | 'recorded' | 'transcribing'
export type ComposerResearchDepth = 'quick' | 'standard' | 'thorough'
export type ComposerExperience = 'chat' | 'agent'

type PromptComposerProps = {
  experience: ComposerExperience
  input: string
  busy: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  attachment: ComposerAttachment | null
  fileError: string
  recordingState: ComposerRecordingState
  recordingSeconds: number
  recordingUrl: string
  voiceNotice: string
  responseLanguage: LanguageCode
  researchDepth: ComposerResearchDepth
  planFirst: boolean
  onInputChange: (value: string) => void
  onSubmit: () => void
  onFile: (file?: File) => void
  onRemoveAttachment: () => void
  onToggleRecording: () => void
  onRetryTranscription: () => void
  onDiscardRecording: () => void
  onLanguageChange: (language: LanguageCode) => void
  onResearchDepthChange: (depth: ComposerResearchDepth) => void
  onPlanFirstChange: (enabled: boolean) => void
}

const RESEARCH_DEPTH_HINTS: Record<ComposerResearchDepth, string> = {
  quick: 'One focused line of enquiry.',
  standard: 'Up to two lines of enquiry, then checked against the sources.',
  thorough: 'Up to three lines of enquiry, then checked and corrected.',
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function PromptComposer({
  experience,
  input,
  busy,
  textareaRef,
  fileInputRef,
  attachment,
  fileError,
  recordingState,
  recordingSeconds,
  recordingUrl,
  voiceNotice,
  responseLanguage,
  researchDepth,
  planFirst,
  onInputChange,
  onSubmit,
  onFile,
  onRemoveAttachment,
  onToggleRecording,
  onRetryTranscription,
  onDiscardRecording,
  onLanguageChange,
  onResearchDepthChange,
  onPlanFirstChange,
}: PromptComposerProps) {
  const [openPanel, setOpenPanel] = useState<'language' | 'research' | null>(null)
  const composerRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!openPanel) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && composerRef.current?.contains(event.target)) return
      setOpenPanel(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPanel(null)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openPanel])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }, [input, textareaRef])

  const grow = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }

  const cannotSubmit = busy
    || recordingState === 'recording'
    || recordingState === 'transcribing'
    || (!input.trim() && !attachment)

  return (
    <div className="composer-zone">
      <form
        ref={composerRef}
        className={`composer${recordingState === 'recording' ? ' recording' : ''}`}
        onSubmit={(event) => { event.preventDefault(); if (!cannotSubmit) onSubmit() }}
      >
        {recordingState !== 'idle' ? (
          <div className={`voice-capture ${recordingState}`}>
            {recordingState === 'recording' ? (
              <>
                <span className="recording-pulse" aria-hidden="true" />
                <span className="voice-state"><b>Recording voice</b><small>{formatDuration(recordingSeconds)} / 5:00</small></span>
                <div className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
                <button type="button" className="voice-stop" onClick={onToggleRecording}>Stop</button>
              </>
            ) : recordingState === 'transcribing' ? (
              <>
                <span className="recording-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z" /><path d="M8 12h2l1.2-3 2 6 1.2-3H17" /></svg></span>
                <span className="voice-state" role="status" aria-live="polite"><b>Transcribing voice…</b><small>Your words will appear below</small></span>
                <div className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
                <button type="button" className="voice-delete" onClick={onDiscardRecording} aria-label="Cancel transcription">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </>
            ) : (
              <>
                <span className="recording-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z" /><path d="M9 12h6" /></svg></span>
                <audio src={recordingUrl} controls preload="metadata" aria-label="Voice recording preview" />
                <span className="voice-state"><b>Could not transcribe</b><small>{formatDuration(recordingSeconds)}</small></span>
                <button type="button" className="voice-transcribe" onClick={onRetryTranscription}>Retry</button>
                <button type="button" className="voice-delete" onClick={onDiscardRecording} aria-label="Delete recording">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </>
            )}
          </div>
        ) : null}

        {voiceNotice ? <div className="voice-review-note" role="status">{voiceNotice}</div> : null}

        {attachment ? (
          <div className="attachment-preview">
            {attachment.kind === 'image' && attachment.data ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment.data} alt="" />
            ) : attachment.kind === 'video' && attachment.data ? (
              <video src={attachment.data} muted preload="metadata" aria-label={attachment.name} />
            ) : (
              <span>{attachment.kind === 'pdf' ? 'PDF' : attachment.kind === 'video' ? 'Video' : 'Document'}</span>
            )}
            <div><b>{attachment.name}</b><small>Ready to send</small></div>
            <button type="button" onClick={onRemoveAttachment} aria-label="Remove file">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={recordingState === 'recording'
            ? 'Recording your voice…'
            : recordingState === 'transcribing'
              ? 'Turning your voice into text…'
            : experience === 'agent'
              ? 'Describe the outcome you want…'
              : 'Ask anything, or describe what you need…'}
          value={input}
          onChange={(event) => { onInputChange(event.target.value); grow() }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!cannotSubmit) onSubmit()
            }
          }}
        />

        <div className="composer-tools">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/markdown,text/csv,application/json"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach an image, video or document" aria-label="Attach file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" className={recordingState === 'recording' ? 'active' : ''} onClick={onToggleRecording} disabled={recordingState === 'transcribing'} title="Record your voice" aria-label="Record voice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="4" width="6" height="11" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" /></svg>
          </button>

          <div className="language-picker composer-popover-root">
            <button
              type="button"
              className={`language-trigger${responseLanguage === DEFAULT_LANGUAGE ? '' : ' chosen'}`}
              onClick={() => setOpenPanel((current) => current === 'language' ? null : 'language')}
              aria-expanded={openPanel === 'language'}
              aria-label={`Answer language: ${findLanguage(responseLanguage).name}`}
              title="Choose the language for answers"
            >
              {findLanguage(responseLanguage).nativeName}
              <span className="chevron" aria-hidden="true">⌄</span>
            </button>
            {openPanel === 'language' ? (
              <div className="language-menu">
                <div className="language-menu-title">Answer me in</div>
                {LANGUAGES.map((option) => (
                  <button
                    type="button"
                    key={option.code}
                    className={option.code === responseLanguage ? 'selected' : ''}
                    onClick={() => { onLanguageChange(option.code); setOpenPanel(null) }}
                  >
                    <span className="language-check">{option.code === responseLanguage ? '✓' : ''}</span>
                    <span><b>{option.nativeName}</b><small>{option.sample}</small></span>
                  </button>
                ))}
                <p className="language-note">Write naturally. AI360 will answer in the language selected here.</p>
              </div>
            ) : null}
          </div>

          {experience === 'agent' ? (
            <div className="research-settings composer-popover-root">
              <button
                type="button"
                className={`research-settings-trigger${planFirst ? ' chosen' : ''}`}
                onClick={() => setOpenPanel((current) => current === 'research' ? null : 'research')}
                aria-expanded={openPanel === 'research'}
                aria-label="Research settings"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6" /></svg>
                <span>{researchDepth[0].toUpperCase() + researchDepth.slice(1)}{planFirst ? ' · Plan first' : ''}</span>
              </button>
              {openPanel === 'research' ? (
                <div className="research-settings-menu">
                  <div className="research-settings-head"><b>Research settings</b><small>Choose how much work AI360 should do.</small></div>
                  <fieldset>
                    <legend>Depth</legend>
                    <div className="agent-depth">
                      {(['quick', 'standard', 'thorough'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={researchDepth === option ? 'active' : ''}
                          aria-pressed={researchDepth === option}
                          onClick={() => onResearchDepthChange(option)}
                          title={RESEARCH_DEPTH_HINTS[option]}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                    <p>{RESEARCH_DEPTH_HINTS[researchDepth]}</p>
                  </fieldset>
                  <button
                    type="button"
                    className={`agent-plan-toggle ${planFirst ? 'active' : ''}`}
                    aria-pressed={planFirst}
                    onClick={() => onPlanFirstChange(!planFirst)}
                  >
                    <span aria-hidden="true">{planFirst ? '✓' : ''}</span>
                    <span><b>Show me the plan first</b><small>Review the plan before research credits are spent.</small></span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : <span className="composer-spacer" />}

          <button type="submit" className="send" disabled={cannotSubmit} aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>
      {fileError ? <div className="file-error" role="alert">{fileError}</div> : null}
      <div className="composer-note">
        AI can make mistakes. Check important information.
        <span>Built with care by AI360 · Accra Innovation Center</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>
    </div>
  )
}
