
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt.js';

export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Analyzes changed source files for security vulnerabilities, bugs, performance problems, maintainability issues, and coding best-practice violations. Use this agent for detailed code quality reviews.',

  prompt: CODE_QUALITY_ANALYZER_PROMPT,

  model: 'inherit',

  tools: ['Read', 'Glob', 'Grep', 'Skill'],

};
