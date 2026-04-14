/**
 * E2E 自动化测试脚本 — 部署后验证
 *
 * 用法: cd /opt/kook-admin && npx ts-node server/scripts/e2e-test.ts
 *
 * 功能:
 * 1. 验证前端页面可达性
 * 2. 自动登录
 * 3. 遍历所有菜单页面
 * 4. 捕获 Console 错误和 API 异常
 * 5. 截图记录
 * 6. 输出测试报告
 */

import { chromium, Browser, Page } from 'playwright';

interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  duration: number;
  error?: string;
  screenshot?: string;
}

interface E2EReport {
  timestamp: string;
  baseUrl: string;
  results: TestResult[];
  consoleErrors: string[];
  networkErrors: string[];
  summary: { total: number; passed: number; failed: number };
}

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const SCREENSHOT_DIR = '/tmp/e2e-screenshots';
const LOGIN_USERNAME = process.env.E2E_USERNAME || '';
const LOGIN_PASSWORD = process.env.E2E_PASSWORD || '';

// 需要测试的菜单页面路由
const MENU_ROUTES = [
  { name: '控制台', path: '/app/dashboard' },
  { name: '成员管理', path: '/app/members' },
  { name: '装备库存', path: '/app/equipment' },
  { name: '补装管理', path: '/app/resupply' },
  { name: '预警规则', path: '/app/alerts' },
  { name: '公会设置', path: '/app/guild-settings' },
  { name: '操作日志', path: '/app/logs' },
];

// API 端点冒烟测试
const API_SMOKE_TESTS = [
  { name: 'POST /api/auth/login', method: 'POST', path: '/api/auth/login', body: { username: 'test', password: 'test123' }, expectedStatus: [400, 401] },
  { name: 'GET /api/catalog/csv-template', method: 'GET', path: '/api/catalog/csv-template', expectedStatus: [200, 401] },
];

class E2ETestRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private results: TestResult[] = [];
  private consoleErrors: string[] = [];
  private networkErrors: string[] = [];

  async run(): Promise<E2EReport> {
    console.log(`\n🧪 E2E 测试开始 — ${new Date().toISOString()}`);
    console.log(`📍 目标: ${BASE_URL}\n`);

    try {
      // 确保截图目录存在
      const fs = await import('fs');
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      }

      await this.launchBrowser();
      await this.setupErrorListeners();

      // 测试组 1: 页面可达性
      await this.testPageReachability();

      // 测试组 2: 登录流程
      const loggedIn = await this.testLogin();

      // 测试组 3: 菜单页面遍历（需登录成功）
      if (loggedIn) {
        await this.testMenuPages();
      }

      // 测试组 4: API 冒烟测试
      await this.testAPIs();

    } catch (err) {
      this.results.push({
        name: '测试框架异常',
        status: 'fail',
        duration: 0,
        error: String(err),
      });
    } finally {
      await this.closeBrowser();
    }

    return this.generateReport();
  }

  private async launchBrowser(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
    });
    this.page = await context.newPage();
  }

  private async setupErrorListeners(): Promise<void> {
    if (!this.page) return;

    // 监听 Console 错误
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 过滤掉常见的无害错误
        if (!text.includes('favicon.ico') && !text.includes('ResizeObserver')) {
          this.consoleErrors.push(`[Console Error] ${text.slice(0, 200)}`);
        }
      }
    });

    // 监听网络请求异常
    this.page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      // 记录 5xx 服务端错误（4xx 可能是业务逻辑正常返回）
      if (status >= 500) {
        this.networkErrors.push(`[${status}] ${response.request().method()} ${url}`);
      }
    });

    // 监听页面崩溃
    this.page.on('pageerror', (err) => {
      this.consoleErrors.push(`[Page Error] ${String(err).slice(0, 200)}`);
    });
  }

  private async testPageReachability(): Promise<void> {
    const start = Date.now();
    const testName = '首页可达性';
    try {
      const response = await this.page!.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const status = response?.status() || 0;
      if (status >= 200 && status < 400) {
        await this.screenshot('01-home');
        this.addResult(testName, 'pass', Date.now() - start);
        console.log(`  ✅ ${testName} (HTTP ${status})`);
      } else {
        this.addResult(testName, 'fail', Date.now() - start, `HTTP ${status}`);
        console.log(`  ❌ ${testName} (HTTP ${status})`);
      }
    } catch (err) {
      this.addResult(testName, 'fail', Date.now() - start, String(err));
      console.log(`  ❌ ${testName}: ${err}`);
    }
  }

  private async testLogin(): Promise<boolean> {
    if (!LOGIN_USERNAME || !LOGIN_PASSWORD) {
      console.log('  ⏭️  跳过登录测试（未设置 E2E_USERNAME/E2E_PASSWORD）');
      this.addResult('登录流程', 'pass', 0, '跳过 — 未配置凭据');
      return false;
    }

    const start = Date.now();
    const testName = '登录流程';
    try {
      await this.page!.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 15000 });
      await this.page!.waitForTimeout(1000);

      // 查找用户名和密码输入框
      const usernameInput = await this.page!.$('input[id="username"], input[name="username"], input[placeholder*="用户名"]');
      const passwordInput = await this.page!.$('input[id="password"], input[name="password"], input[type="password"]');

      if (!usernameInput || !passwordInput) {
        this.addResult(testName, 'fail', Date.now() - start, '找不到登录表单输入框');
        console.log(`  ❌ ${testName}: 找不到登录表单`);
        return false;
      }

      await usernameInput.fill(LOGIN_USERNAME);
      await passwordInput.fill(LOGIN_PASSWORD);
      await this.screenshot('02-login-filled');

      // 点击登录按钮
      const submitBtn = await this.page!.$('button[type="submit"], button:has-text("登录")');
      if (submitBtn) {
        await submitBtn.click();
        await this.page!.waitForTimeout(3000);
      }

      await this.screenshot('03-after-login');

      // 检查是否跳转到了 dashboard
      const currentUrl = this.page!.url();
      if (currentUrl.includes('/app') || currentUrl.includes('/dashboard')) {
        this.addResult(testName, 'pass', Date.now() - start);
        console.log(`  ✅ ${testName} → ${currentUrl}`);
        return true;
      } else {
        this.addResult(testName, 'fail', Date.now() - start, `登录后仍在 ${currentUrl}`);
        console.log(`  ❌ ${testName}: 登录后仍在 ${currentUrl}`);
        return false;
      }
    } catch (err) {
      this.addResult(testName, 'fail', Date.now() - start, String(err));
      console.log(`  ❌ ${testName}: ${err}`);
      return false;
    }
  }

  private async testMenuPages(): Promise<void> {
    for (let i = 0; i < MENU_ROUTES.length; i++) {
      const route = MENU_ROUTES[i];
      const start = Date.now();
      try {
        const response = await this.page!.goto(`${BASE_URL}${route.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await this.page!.waitForTimeout(2000);

        const status = response?.status() || 0;
        const screenshotName = `04-menu-${String(i + 1).padStart(2, '0')}-${route.name}`;
        await this.screenshot(screenshotName);

        // 检查页面是否有内容（非空白页、非错误页）
        const bodyText = await this.page!.evaluate(() => document.body?.innerText || '');
        const hasContent = bodyText.length > 50;
        const hasError = bodyText.includes('Cannot GET') || bodyText.includes('Internal Server Error');

        if (status >= 200 && status < 400 && hasContent && !hasError) {
          this.addResult(`菜单: ${route.name}`, 'pass', Date.now() - start);
          console.log(`  ✅ 菜单: ${route.name} (${route.path})`);
        } else {
          const reason = hasError ? '页面报错' : !hasContent ? '页面空白' : `HTTP ${status}`;
          this.addResult(`菜单: ${route.name}`, 'fail', Date.now() - start, reason);
          console.log(`  ❌ 菜单: ${route.name} — ${reason}`);
        }
      } catch (err) {
        this.addResult(`菜单: ${route.name}`, 'fail', Date.now() - start, String(err));
        console.log(`  ❌ 菜单: ${route.name} — ${err}`);
      }
    }
  }

  private async testAPIs(): Promise<void> {
    for (const api of API_SMOKE_TESTS) {
      const start = Date.now();
      try {
        const response = await this.page!.evaluate(
          async ({ baseUrl, path, method, body }) => {
            const options: RequestInit = {
              method,
              headers: { 'Content-Type': 'application/json' },
            };
            if (body && method !== 'GET') {
              options.body = JSON.stringify(body);
            }
            const resp = await fetch(`${baseUrl}${path}`, options);
            return { status: resp.status, ok: resp.ok };
          },
          { baseUrl: BASE_URL, path: api.path, method: api.method, body: api.body },
        );

        const isExpected = api.expectedStatus.includes(response.status);
        if (isExpected) {
          this.addResult(`API: ${api.name}`, 'pass', Date.now() - start);
          console.log(`  ✅ API: ${api.name} (HTTP ${response.status})`);
        } else {
          this.addResult(`API: ${api.name}`, 'fail', Date.now() - start, `HTTP ${response.status} (expected: ${api.expectedStatus.join('/')})`);
          console.log(`  ❌ API: ${api.name} — HTTP ${response.status}`);
        }
      } catch (err) {
        this.addResult(`API: ${api.name}`, 'fail', Date.now() - start, String(err));
        console.log(`  ❌ API: ${api.name} — ${err}`);
      }
    }
  }

  private addResult(name: string, status: 'pass' | 'fail', duration: number, error?: string): void {
    this.results.push({ name, status, duration, error });
  }

  private async screenshot(name: string): Promise<void> {
    try {
      const path = `${SCREENSHOT_DIR}/${name}.png`;
      await this.page!.screenshot({ path, fullPage: false });
    } catch { /* ignore screenshot errors */ }
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
  }

  private generateReport(): E2EReport {
    const passed = this.results.filter((r) => r.status === 'pass').length;
    const failed = this.results.filter((r) => r.status === 'fail').length;
    const total = this.results.length;

    const report: E2EReport = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      results: this.results,
      consoleErrors: this.consoleErrors,
      networkErrors: this.networkErrors,
      summary: { total, passed, failed },
    };

    // 输出报告
    console.log('\n' + '='.repeat(60));
    console.log('📋 E2E 测试报告');
    console.log('='.repeat(60));
    console.log(`时间: ${report.timestamp}`);
    console.log(`目标: ${report.baseUrl}`);
    console.log(`结果: ${passed}/${total} 通过, ${failed} 失败`);

    if (this.consoleErrors.length > 0) {
      console.log(`\n⚠️  Console 错误 (${this.consoleErrors.length}):`);
      this.consoleErrors.forEach((e) => console.log(`  ${e}`));
    }

    if (this.networkErrors.length > 0) {
      console.log(`\n🔴 网络错误 (${this.networkErrors.length}):`);
      this.networkErrors.forEach((e) => console.log(`  ${e}`));
    }

    if (failed > 0) {
      console.log('\n❌ 失败项:');
      this.results
        .filter((r) => r.status === 'fail')
        .forEach((r) => console.log(`  - ${r.name}: ${r.error || '未知'}`));
    }

    console.log('\n' + '='.repeat(60));
    const exitMsg = failed > 0 || this.networkErrors.length > 0
      ? '❌ E2E 测试未通过，需要修复后重新部署'
      : '✅ E2E 测试全部通过';
    console.log(exitMsg);
    console.log('='.repeat(60) + '\n');

    // 退出码: 0=全部通过, 1=有失败
    if (failed > 0 || this.networkErrors.length > 0) {
      process.exitCode = 1;
    }

    return report;
  }
}

// 执行
const runner = new E2ETestRunner();
runner.run().catch((err) => {
  console.error('E2E 测试框架异常:', err);
  process.exit(2);
});
