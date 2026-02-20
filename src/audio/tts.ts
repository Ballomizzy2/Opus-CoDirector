let speaking = false

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  if (speaking) window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.15
  utterance.volume = 0.7
  utterance.onstart = () => { speaking = true }
  utterance.onend = () => { speaking = false }
  utterance.onerror = () => { speaking = false }
  window.speechSynthesis.speak(utterance)
}

export function cancelSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    speaking = false
  }
}

export function isSpeaking() {
  return speaking
}
