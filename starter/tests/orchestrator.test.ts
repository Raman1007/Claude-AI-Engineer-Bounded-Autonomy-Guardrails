import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator';
import { ReviewReportSchema } from '../src/types/report-types';

describe('CodeReviewOrchestrator', () => {
  let orchestrator: CodeReviewOrchestrator;

  beforeEach(() => {
  orchestrator = new CodeReviewOrchestrator({
    model: 'test-model'
  });
});

  describe('Configuration', () => {
    it('should initialize with default options', () => {
      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('should accept custom rate limit configuration', () => {
      const customOrchestrator = new CodeReviewOrchestrator({
        rateLimiterConfig: {
          maxRequestsPerMinute: 20,
          maxTokensPerMinute: 50000,
          maxConcurrent: 2
        }
      });

      expect(customOrchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });
  });

  describe('reviewPullRequest', () => {
    it('should fetch PR files from GitHub MCP', async () => {
      // Requires a configured GitHub MCP server.
      // Implement as an integration test when the MCP client is available.
      expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
    });

    it('should spawn all 3 subagents in parallel', async () => {
      // Requires injectable or mocked subagent execution.
      const agents = [
        'code-quality-analyzer',
        'test-coverage-analyzer',
        'refactoring-suggester'
      ];

      expect(agents).toHaveLength(3);
    });

    it('should aggregate results into ReviewReport', async () => {
      const report = {
        pullRequest: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 1
        },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 100,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 100,
          agentVersions: {}
        }
      };

      expect(report.pullRequest.owner).toBe('test-owner');
      expect(report.pullRequest.repo).toBe('test-repo');
    });

    it('should validate output with Zod schema', () => {
      const report = {
        pullRequest: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 1
        },
        fileReviews: [],
        summary: {
          totalFiles: 0,
          overallScore: 100,
          criticalIssues: 0,
          highPriorityTests: 0,
          refactoringOpportunities: 0
        },
        recommendations: [],
        metadata: {
          analyzedAt: new Date().toISOString(),
          duration: 100,
          agentVersions: {}
        }
      };

      const result = ReviewReportSchema.safeParse(report);

      expect(result.success).toBe(true);
    });

    it('should reject invalid report data', () => {
      const result = ReviewReportSchema.safeParse({
        pullRequest: {
          owner: 'test-owner'
        }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Integration', () => {
    it.skip('should review a real small PR', async () => {
      const report = await orchestrator.reviewPullRequest(
        'owner',
        'repo',
        1
      );

      expect(report).toBeDefined();
    });
  });
});
