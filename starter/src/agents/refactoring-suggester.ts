
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt.js';

export const refactoringSuggester: AgentDefinition = {
  description:
    'Identifies opportunities to improve code structure, simplify complex logic, modernize JavaScript and TypeScript patterns, improve naming, and apply appropriate design patterns.',

  prompt: REFACTORING_SUGGESTER_PROMPT,

  model: 'inherit',

  tools: ['Read', 'Glob', 'Grep', 'Skill'],

};
