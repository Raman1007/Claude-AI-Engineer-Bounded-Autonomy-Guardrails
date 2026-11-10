
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt.js';

export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Analyzes source code and corresponding test files to estimate test coverage, identify untested functions, branches and edge cases, and propose specific actionable tests.',

  prompt: TEST_COVERAGE_ANALYZER_PROMPT,

  model: 'inherit',

  tools: ['Read', 'Glob', 'Grep'],

};
