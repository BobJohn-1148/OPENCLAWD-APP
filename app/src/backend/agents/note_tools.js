const { emitEvent } = require('../eventBus/bus');

function bulletsFrom(text, limit = 6) {
  return String(text || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length > 8)
    .slice(0, limit);
}

function makeSummary(note) {
  const lines = bulletsFrom(note.content_md, 5);
  if (lines.length === 0) return 'No substantial content found to summarize.';
  return lines.map((x) => `• ${x}`).join('\n');
}

function makeFlashcards(note) {
  const lines = bulletsFrom(note.content_md, 4);
  if (lines.length === 0) return 'No flashcards could be generated from this note yet.';
  return lines
    .map((x, i) => `Q${i + 1}: What is the key point about "${x.slice(0, 60)}"?\nA${i + 1}: ${x}`)
    .join('\n\n');
}

function makeTasks(note) {
  const lines = bulletsFrom(note.content_md, 6)
    .filter((x) => /\b(todo|task|due|submit|finish|review|study|read|write)\b/i.test(x));
  if (lines.length === 0) return 'No explicit tasks found. Suggested: review this note for 20 minutes and create a quiz.';
  return lines.map((x) => `- [ ] ${x}`).join('\n');
}

function mkNoteToolAgent(key, eventType, makeResult) {
  return {
    key,
    name: key,
    canHandle(evt) {
      return evt.type === eventType;
    },
    async onEvent(evt, registry) {
      const note = evt.payload?.note || {};
      const result = makeResult(note);
      emitEvent(registry.db, {
        type: 'notes.ai.result',
        source_agent_key: key,
        correlation_id: evt.correlation_id || evt.id,
        payload: {
          action: eventType.replace('notes.ai.', '').replace('.requested', ''),
          noteId: note.id,
          title: note.title,
          result,
        },
      });
      registry.audit(`${key}.result.created`, { noteId: note.id }, key);
    },
  };
}

const NoteSummarizerAgent = mkNoteToolAgent('note_summarizer', 'notes.ai.summary.requested', makeSummary);
const NoteFlashcardMakerAgent = mkNoteToolAgent('note_flashcard_maker', 'notes.ai.flashcards.requested', makeFlashcards);
const NoteTaskExtractorAgent = mkNoteToolAgent('note_task_extractor', 'notes.ai.tasks.requested', makeTasks);

module.exports = {
  NoteSummarizerAgent,
  NoteFlashcardMakerAgent,
  NoteTaskExtractorAgent,
};
