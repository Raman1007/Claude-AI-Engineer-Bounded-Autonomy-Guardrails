
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
  type ReviewReport
} from './types/index.js';

import {
  codeQualityAnalyzer,
  testCoverageAnalyzer,
  refactoringSuggester
} from './agents/index.js';

import { mcpServersConfig } from './config/mcp.config.js';
import { buildOrchestratorPrompt } from './prompts/index.js';

import {
  ReviewError,
  ErrorCodes
} from './utils/error-handler.js';

import { logger } from './utils/logger.js';

/**
 * Orchestrator configuration options.
 */
export interface OrchestratorOptions {
  model?: string;
  maxTurns?: number;
  cwd?: string;
}

/**
 * Main Code Review Orchestrator.
 *
 * Coordinates GitHub MCP, ESLint MCP and three
 * specialized subagents to review pull requests.
 */
export class CodeReviewOrchestrator {
  private readonly model: string;
  private readonly maxTurns: number;
  private readonly cwd: string;

  private readonly agents: Record<string, AgentDefinition>;

  constructor(options: OrchestratorOptions = {}) {
    this.model = options.model || process.env.ANTHROPIC_MODEL || '';
    this.maxTurns = options.maxTurns ?? 50;
    this.cwd = options.cwd || process.cwd();

    if (!this.model) {
      throw new ReviewError(
        'ANTHROPIC_MODEL is not configured. Set it in your .env file.',
        ErrorCodes.INVALID_CONFIG
      );
    }

    this.agents = {
      'code-quality-analyzer': codeQualityAnalyzer,
      'test-coverage-analyzer': testCoverageAnalyzer,
      'refactoring-suggester': refactoringSuggester
    };

    logger.info('Code review orchestrator initialized', {
      model: this.model,
      maxTurns: this.maxTurns,
      agents: Object.keys(this.agents)
    });
  }

  /**
   * Review a pull request using three specialized subagents.
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();

    if (!owner || !repo || !Number.isInteger(prNumber) || prNumber <= 0) {
      throw new ReviewError(
        'Invalid pull request information.',
        ErrorCodes.INVALID_CONFIG,
        { owner, repo, prNumber }
      );
    }

    logger.info('Starting pull request review', {
      owner,
      repo,
      prNumber
    });

    let structuredOutput: unknown;

    try {
      const prompt = buildOrchestratorPrompt(
        owner,
        repo,
        prNumber
      );

      const agents = this.agents;

      const response = query({
        prompt,

        options: {
          model: this.model,
          cwd: this.cwd,

          maxTurns: this.maxTurns,

          agents,

          mcpServers: mcpServersConfig,

          // Task is required for spawning the three subagents.
          // GitHub MCP tools are explicitly approved for CI usage.
          allowedTools: [
            'Read',
            'Glob',
            'Grep',
            'Task',
            'mcp__github__get_pull_request',
            'mcp__github__get_pull_request_files',
            'mcp__github__get_pull_request_diff',
            'mcp__github__get_file_contents'
          ],

          // Automated execution without interactive permission prompts.
          permissionMode: 'dontAsk',

          // Keep the review read-only.
          disallowedTools: [
            'Edit',
            'Write',
            'Bash'
          ],

          // Load project-level Claude configuration and skills.
          settingSources: ['project'],

          // Require output matching our ReviewReport schema.
          outputFormat: {
            type: 'json_schema',
            schema: ReviewReportJSONSchema
          }
        }
      });

      // query() returns an asynchronous iterable.
      for await (const message of response) {
        if (message.type === 'result') {
          const result = message as typeof message & {
            structured_output?: unknown;
          };

          if (result.structured_output !== undefined) {
            structuredOutput = result.structured_output;
          }

          if (result.subtype === 'success') {
            logger.info('Claude review query completed');
          } else {
            logger.error('Claude review query returned a non-success result', {
              subtype: result.subtype
            });
          }
        }
      }

      if (structuredOutput === undefined) {
        throw new ReviewError(
          'Claude did not return a structured review report.',
          ErrorCodes.STRUCTURED_OUTPUT_FAILED
        );
      }

      // Validate the structured result at runtime.
      const validation = ReviewReportSchema.safeParse(
        structuredOutput
      );

      if (!validation.success) {
        logger.error('Review report validation failed', {
          errors: validation.error.issues
        });

        throw new ReviewError(
          'The generated report does not match ReviewReportSchema.',
          ErrorCodes.VALIDATION_FAILED,
          {
            issues: validation.error.issues
          }
        );
      }

      const report = validation.data;

      // Ensure report metadata reflects actual execution time.
      const duration = Date.now() - startTime;

      const finalReport: ReviewReport = {
        ...report,

        metadata: {
          ...report.metadata,
          analyzedAt: new Date().toISOString(),
          duration,
          agentVersions: {
            ...report.metadata.agentVersions,
            orchestrator: '1.0.0'
          }
        }
      };

      logger.info('Pull request review completed successfully', {
        owner,
        repo,
        prNumber,
        totalFiles: finalReport.summary.totalFiles,
        overallScore: finalReport.summary.overallScore,
        duration
      });

      return finalReport;

    } catch (error) {
      logger.error('Pull request review failed', {
        owner,
        repo,
        prNumber,
        error: error instanceof Error
          ? error.message
          : String(error)
      });

      if (error instanceof ReviewError) {
        throw error;
      }

      throw new ReviewError(
        `Failed to review pull request: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
        ErrorCodes.AGENT_FAILED,
        {
          owner,
          repo,
          prNumber
        }
      );
    }
  }
}

/**
 * Backwards-compatible shorter class name.
 */
export { CodeReviewOrchestrator as Orchestrator };
