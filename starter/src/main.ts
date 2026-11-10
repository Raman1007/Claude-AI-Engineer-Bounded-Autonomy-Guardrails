
import * as dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 */
async function main(): Promise<void> {
  // ==========================================
  // 1. Validate command-line arguments
  // ==========================================

  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    console.error(
      '❌ Missing arguments.\n\n' +
      'Usage: npm run dev -- <owner> <repo> <pr-number>\n' +
      'Example: npm run dev -- octocat Hello-World 1'
    );
    process.exitCode = 1;
    return;
  }

  const prNumber = Number(prStr);

  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    console.error('❌ PR number must be a valid positive integer.');
    process.exitCode = 1;
    return;
  }

  // ==========================================
  // 2. Validate authentication
  // ==========================================

  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);

  const hasAwsCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );

  if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else if (hasAwsCredentials) {
    if (!process.env.AWS_REGION) {
      console.error(
        '❌ AWS_REGION is missing. Set it in your .env file.'
      );
      process.exitCode = 1;
      return;
    }

    console.log('🔐 Using AWS Bedrock authentication');
  } else {
    console.error(
      '❌ Authentication configuration missing.\n\n' +
      'Configure one of the following in your .env file:\n\n' +
      'Option 1: Anthropic API\n' +
      'ANTHROPIC_API_KEY=your_api_key\n\n' +
      'Option 2: AWS Bedrock\n' +
      'AWS_ACCESS_KEY_ID=your_access_key\n' +
      'AWS_SECRET_ACCESS_KEY=your_secret_key\n' +
      'AWS_REGION=us-east-1'
    );

    process.exitCode = 1;
    return;
  }

  // ==========================================
  // 3. Validate model configuration
  // ==========================================

  const model = process.env.ANTHROPIC_MODEL;

  if (!model) {
    console.error(
      '❌ ANTHROPIC_MODEL is missing.\n\n' +
      'For Anthropic API:\n' +
      'ANTHROPIC_MODEL=claude-sonnet-4-5-20250929\n\n' +
      'For AWS Bedrock:\n' +
      'ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0'
    );

    process.exitCode = 1;
    return;
  }

  console.log(`🤖 Using model: ${model}`);

  // ==========================================
  // 4. Run code review
  // ==========================================

  try {
    console.log('\n🚀 Starting code review...');
    console.log(`Repository: ${owner}/${repo}`);
    console.log(`Pull Request: #${prNumber}`);

    const startTime = Date.now();

    const orchestrator = new CodeReviewOrchestrator();

    const report = await orchestrator.reviewPullRequest(
      owner,
      repo,
      prNumber
    );

    const duration = Date.now() - startTime;

    console.log('\n✅ Code review completed successfully!');

    // ==========================================
    // 5. Generate reports
    // ==========================================

    const reportGenerator = new ReportGenerator();

    const markdown = reportGenerator.generateMarkdownReport(report);
    const html = reportGenerator.generateHTMLReport(report);
    const json = reportGenerator.generateJSONReport(report);

    // Create reports directory if it doesn't exist
    const reportsDir = join(process.cwd(), 'reports');

    await mkdir(reportsDir, { recursive: true });

    const filename = `${owner}_${repo}_${prNumber}`;

    // Save all three formats
    const markdownPath = join(reportsDir, `${filename}.md`);
    const htmlPath = join(reportsDir, `${filename}.html`);
    const jsonPath = join(reportsDir, `${filename}.json`);

    await Promise.all([
      writeFile(markdownPath, markdown, 'utf-8'),
      writeFile(htmlPath, html, 'utf-8'),
      writeFile(jsonPath, json, 'utf-8')
    ]);

    console.log('\n📁 Reports generated successfully!');
    console.log(`📄 Markdown: ${markdownPath}`);
    console.log(`🌐 HTML:     ${htmlPath}`);
    console.log(`📋 JSON:     ${jsonPath}`);

    console.log('\n📊 Review Summary:');
    console.log(`Files reviewed: ${report.summary.totalFiles}`);
    console.log(`Overall score: ${report.summary.overallScore}/100`);
    console.log(`Critical issues: ${report.summary.criticalIssues}`);
    console.log(`High priority tests: ${report.summary.highPriorityTests}`);
    console.log(`Refactoring opportunities: ${report.summary.refactoringOpportunities}`);
    console.log(`Duration: ${duration}ms`);

  } catch (error) {
    console.error('\n❌ Code review failed:');

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }

    process.exitCode = 1;
  }
}

main();
